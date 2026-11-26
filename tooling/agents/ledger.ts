import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

import { z } from "zod";

import { errorMessage, parseCliArgs, parseWholeNumber, stripLeadingSeparator } from "../cli.ts";
import { REPO_ROOT } from "../paths.ts";
import { type FileLockOptions, getErrnoCode, withFileLock } from "./file-lock.ts";

export const LEDGER_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_LEDGER_SLUG_LENGTH = 64;
export const DEFAULT_TAIL_LIMIT = 10;
export const SUMMARY_LATEST_LIMIT = 5;

export const LEDGER_COLUMNS = [
  "ts",
  "run_id",
  "phase",
  "decision",
  "why",
  "evidence",
  "result",
] as const;

export const LEDGER_HEADER = LEDGER_COLUMNS.join("\t");

const FORMULA_PREFIX_PATTERN = /^[=+\-@"]/;
const NON_WHITESPACE_TOKEN_PATTERN = /^\S+$/;
const MAX_SYMLINK_HOPS = 40;
const isoTimestampSchema = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);

const DEFAULT_LEDGER_LOCK_INITIAL_DELAY_MS = 15;
const DEFAULT_LEDGER_LOCK_MAX_DELAY_MS = 150;
// Ledger paths may never enter this directory, so a lock path cannot name another ledger.
const LEDGER_LOCK_DIRECTORY = ".ledger-locks";
const strictUtf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const isControlCharCode = (code: number): boolean =>
  code <= 0x1f || code === 0x7f || code === 0x2028 || code === 0x2029;

const hasControlChars = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (isControlCharCode(value.charCodeAt(index))) {
      return true;
    }
  }
  return false;
};

const isValidIsoTimestamp = (value: string): boolean => isoTimestampSchema.safeParse(value).success;

/** Every ledger cell is one line of text; later checks run only once this one passes. */
const ledgerTextSchema = z.string().refine((value) => !hasControlChars(value), {
  message: "must not contain control characters",
  abort: true,
});

const requiredLedgerCellSchema = ledgerTextSchema.refine(
  (value) => value.trim().length > 0,
  "must be non-empty",
);

const optionalLedgerCellSchema = ledgerTextSchema.refine(
  (value) => value.length === 0 || value.trim().length > 0,
  "must not be whitespace-only",
);

const ledgerTimestampSchema = ledgerTextSchema.refine(
  isValidIsoTimestamp,
  'must be a valid ISO-8601 timestamp (e.g. "2026-11-24T22:00:00.000Z")',
);

const ledgerRunIdSchema = ledgerTextSchema
  .refine((value) => value.length > 0, { message: "must be non-empty", abort: true })
  .refine((value) => NON_WHITESPACE_TOKEN_PATTERN.test(value), {
    message: "must be a single token without whitespace",
    abort: true,
  })
  .refine(
    (value) => !FORMULA_PREFIX_PATTERN.test(value),
    'must not start with a spreadsheet formula character (=, +, -, @, ")',
  );

export const ledgerEntrySchema = z.object({
  ts: ledgerTimestampSchema,
  run_id: ledgerRunIdSchema,
  phase: requiredLedgerCellSchema,
  decision: requiredLedgerCellSchema,
  why: requiredLedgerCellSchema,
  evidence: optionalLedgerCellSchema,
  result: optionalLedgerCellSchema,
});

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const ledgerLogResultSchema = z.object({
  file: z.string().min(1),
  created: z.boolean(),
  resumed: z.boolean(),
  previousRunId: z.string().min(1).nullable(),
  appended: z.array(ledgerEntrySchema).min(1),
});

export type LedgerLogResult = z.infer<typeof ledgerLogResultSchema>;

export const ledgerTailResultSchema = z.object({
  file: z.string().min(1),
  exists: z.boolean(),
  totalEntries: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  entries: z.array(ledgerEntrySchema),
});

export type LedgerTailResult = z.infer<typeof ledgerTailResultSchema>;

export const ledgerRunSummarySchema = z.object({
  run_id: z.string().min(1),
  entryCount: z.number().int().positive(),
  firstTs: z.string().min(1),
  lastTs: z.string().min(1),
});

export type LedgerRunSummary = z.infer<typeof ledgerRunSummarySchema>;

const positiveCountSchema = z.number().int().positive();

const countRecordSchema = z
  .custom<Record<string, number>>(
    (value) => typeof value === "object" && value !== null && !Array.isArray(value),
    "Expected a count record object",
  )
  .superRefine((record, ctx) => {
    for (const [key, count] of Object.entries(record)) {
      const parsed = positiveCountSchema.safeParse(count);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: parsed.error.issues[0]?.message ?? "Expected a positive integer count",
        });
      }
    }
  })
  .transform((record) => Object.fromEntries(Object.entries(record)));

export const ledgerSummarySchema = z.object({
  file: z.string().min(1),
  exists: z.boolean(),
  totalEntries: z.number().int().nonnegative(),
  runs: z.array(ledgerRunSummarySchema),
  phaseCounts: countRecordSchema,
  resultCounts: countRecordSchema,
  latestEntries: z.array(ledgerEntrySchema),
  decisions: z.array(z.string().min(1)),
});

export type LedgerSummary = z.infer<typeof ledgerSummarySchema>;

export type LedgerLockOptions = Pick<
  FileLockOptions,
  "timeoutMs" | "staleMs" | "initialDelayMs" | "maxDelayMs"
>;

export type LedgerLogInput = {
  slug?: string;
  file?: string;
  runId: string;
  phase: string;
  decision: string;
  why: string;
  evidence?: string;
  result?: string;
  ts?: string;
  repoRoot?: string;
  cwd?: string;
  now?: () => Date;
  lockOptions?: LedgerLockOptions;
};

export type LedgerLogCliOptions = {
  slug?: string;
  file?: string;
  runId: string;
  phase: string;
  decision: string;
  why: string;
  evidence?: string;
  result?: string;
  ts?: string;
  json: boolean;
};

export type LedgerTailCliOptions = {
  slug?: string;
  file?: string;
  limit: number;
  json: boolean;
};

export type LedgerSummaryCliOptions = {
  slug?: string;
  file?: string;
  json: boolean;
};

export const validateLedgerSlug = (slug: string): string => {
  if (!slug || slug.length > MAX_LEDGER_SLUG_LENGTH || !LEDGER_SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid ledger slug "${slug}". Use lowercase alphanumeric characters and single hyphens (1-${MAX_LEDGER_SLUG_LENGTH} chars, e.g. "feat-auth").`,
    );
  }
  return slug;
};

export const validateLedgerRunId = (runId: string): string => {
  const parsed = ledgerRunIdSchema.safeParse(runId);
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? "invalid run_id";
    throw new Error(
      `Invalid --run-id "${runId}": ${detail}. Use a single non-empty token without whitespace (e.g. "run-1", "run_2", "session:1").`,
    );
  }
  return parsed.data;
};

/** Returns the real path of `path`, or null when it does not exist; other failures throw. */
const realpathIfExists = (path: string): string | null => {
  try {
    return realpathSync(path);
  } catch (error) {
    if (getErrnoCode(error) === "ENOENT") {
      return null;
    }
    throw error;
  }
};

/** Returns the absolute target of a symlink at `path`, or null when `path` is not a readable symlink. */
const followSymlinkOnce = (path: string): string | null => {
  try {
    return lstatSync(path).isSymbolicLink() ? resolve(dirname(path), readlinkSync(path)) : null;
  } catch {
    return null;
  }
};

/**
 * Canonicalizes a path that does not exist yet. A dangling symlink at the path or an ancestor (such
 * as an alias to a not-yet-created ledger) is followed; otherwise the nearest existing ancestor is
 * canonicalized and the missing trailing segments are kept.
 */
const canonicalizeMissingPath = (absolute: string, depth: number): string => {
  const followLink = (path: string) => (depth < MAX_SYMLINK_HOPS ? followSymlinkOnce(path) : null);

  const linkTarget = followLink(absolute);
  if (linkTarget !== null) {
    return canonicalizeLedgerPath(linkTarget, depth + 1);
  }
  const trailingSegments: string[] = [];
  for (let current = absolute; dirname(current) !== current;) {
    trailingSegments.unshift(basename(current));
    current = dirname(current);
    const realAncestor = realpathIfExists(current);
    if (realAncestor !== null) {
      return join(realAncestor, ...trailingSegments);
    }
    const ancestorTarget = followLink(current);
    if (ancestorTarget !== null) {
      return canonicalizeLedgerPath(join(ancestorTarget, ...trailingSegments), depth + 1);
    }
  }
  return absolute;
};

/** Resolves symlinks in a ledger path, even one that does not exist yet, so aliases share one lock. */
const canonicalizeLedgerPath = (targetPath: string, depth = 0): string => {
  const absolute = resolve(targetPath);
  try {
    return realpathIfExists(absolute) ?? canonicalizeMissingPath(absolute, depth);
  } catch {
    // A path that cannot be inspected is used as given.
    return absolute;
  }
};

export const ledgerPathForSlug = (slug: string, repoRoot = REPO_ROOT): string =>
  join(repoRoot, ".tmp", "ledgers", `${validateLedgerSlug(slug)}.tsv`);

const rejectReservedLockPath = (filePath: string, rawFile: string): string => {
  if (filePath.split(sep).includes(LEDGER_LOCK_DIRECTORY)) {
    throw new Error(
      `Invalid ledger file path "${rawFile}": "${LEDGER_LOCK_DIRECTORY}" directories are reserved for ledger locks.`,
    );
  }
  return filePath;
};

export const resolveLedgerFilePath = ({
  slug,
  file,
  repoRoot = REPO_ROOT,
  cwd = process.cwd(),
}: {
  slug?: string;
  file?: string;
  repoRoot?: string;
  cwd?: string;
}): string => {
  const validatedSlug = slug !== undefined ? validateLedgerSlug(slug) : undefined;
  if (file !== undefined) {
    const trimmed = file.trim();
    if (!trimmed || trimmed.includes("\0")) {
      throw new Error(`Invalid ledger file path "${file}".`);
    }
    return rejectReservedLockPath(canonicalizeLedgerPath(resolve(cwd, trimmed)), file);
  }
  if (!validatedSlug) {
    throw new Error("Missing --slug <slug> (or --file <path>).");
  }
  return canonicalizeLedgerPath(join(repoRoot, ".tmp", "ledgers", `${validatedSlug}.tsv`));
};

const LEDGER_LOCK_NAME_PREFIX_LENGTH = 48;

/**
 * Lock basenames stay bounded (a readable prefix plus a hash of the canonical ledger path), so a
 * ledger whose own name is near the filesystem limit can still be locked and staged.
 */
export const ledgerLockPathForFile = (filePath: string): string => {
  const prefix = basename(filePath).slice(0, LEDGER_LOCK_NAME_PREFIX_LENGTH);
  const digest = createHash("sha256").update(filePath).digest("hex").slice(0, 16);
  return join(dirname(filePath), LEDGER_LOCK_DIRECTORY, `${prefix}-${digest}.lock`);
};

const replaceControlCharsWithSpace = (value: string): string => {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    result += isControlCharCode(value.charCodeAt(index)) ? " " : value[index];
  }
  return result;
};

/**
 * Sanitizes a TSV cell into a single line free of tabs/newlines/control chars and
 * neutralizes spreadsheet formula prefixes (`=`, `+`, `-`, `@`, `"`).
 */
export const sanitizeLedgerCell = (value: string): string => {
  const collapsed = replaceControlCharsWithSpace(value).replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) {
    return "";
  }
  return FORMULA_PREFIX_PATTERN.test(collapsed) ? `'${collapsed}` : collapsed;
};

const requireSanitizedCell = (fieldName: string, rawValue: string): string => {
  const sanitized = sanitizeLedgerCell(rawValue);
  if (sanitized.length === 0) {
    throw new Error(`Ledger field "${fieldName}" must be non-empty after sanitization.`);
  }
  return sanitized;
};

const validateTimestamp = (rawTs: string): string => {
  const trimmed = rawTs.trim();
  if (!isValidIsoTimestamp(trimmed)) {
    throw new Error(
      `Invalid --ts value "${rawTs}". Expected an ISO-8601 timestamp (e.g. "2026-11-24T22:00:00.000Z").`,
    );
  }
  return trimmed;
};

export const formatLedgerRow = (entry: LedgerEntry): string =>
  LEDGER_COLUMNS.map((column) => entry[column]).join("\t");

const describeRowIssues = (issues: z.ZodError["issues"]): string => {
  const [onlyIssue] = issues;
  if (issues.length === 1 && onlyIssue) {
    const column = onlyIssue.path.map(String).join(".");
    return `${column ? ` (${column})` : ""}: ${onlyIssue.message}`;
  }
  const detail = issues
    .map((issue) => {
      const column = issue.path.map(String).join(".");
      return column ? `${column}: ${issue.message}` : issue.message;
    })
    .join("; ");
  return `: ${detail}`;
};

const parseLedgerRow = (line: string, lineNumber: number, filePath: string): LedgerEntry => {
  const cols = line.split("\t");
  if (cols.length !== LEDGER_COLUMNS.length) {
    throw new Error(
      `Malformed decision ledger at "${filePath}" line ${lineNumber}: expected ${LEDGER_COLUMNS.length} tab-separated columns, found ${cols.length}.`,
    );
  }
  const parsed = ledgerEntrySchema.safeParse(
    Object.fromEntries(LEDGER_COLUMNS.map((column, index) => [column, cols[index]])),
  );
  if (!parsed.success) {
    throw new Error(
      `Malformed decision ledger at "${filePath}" line ${lineNumber}${describeRowIssues(parsed.error.issues)}.`,
    );
  }
  return parsed.data;
};

export const parseLedgerTsv = (content: string, filePath: string): LedgerEntry[] => {
  const normalized = content.replace(/\r?\n$/, "");
  if (normalized.length === 0) {
    throw new Error(`Malformed decision ledger at "${filePath}": file is empty (missing header).`);
  }

  const [header, ...rows] = normalized.split(/\r?\n/);
  if (header !== LEDGER_HEADER) {
    throw new Error(
      `Malformed decision ledger at "${filePath}": invalid header (expected "${LEDGER_HEADER}").`,
    );
  }
  // Data rows start on the second line of the file.
  return rows.map((line, index) => parseLedgerRow(line, index + 2, filePath));
};

export const withLedgerLock = async <T>(
  filePath: string,
  operation: () => Promise<T> | T,
  options: LedgerLockOptions = {},
): Promise<T> =>
  withFileLock(ledgerLockPathForFile(canonicalizeLedgerPath(filePath)), operation, {
    label: "decision ledger",
    timeoutMs: options.timeoutMs,
    staleMs: options.staleMs,
    initialDelayMs: options.initialDelayMs ?? DEFAULT_LEDGER_LOCK_INITIAL_DELAY_MS,
    maxDelayMs: options.maxDelayMs ?? DEFAULT_LEDGER_LOCK_MAX_DELAY_MS,
  });

const writeFileAtomically = (filePath: string, content: string): void => {
  // Short fixed-length basename in the destination directory so the final rename stays atomic.
  const tempPath = join(dirname(filePath), `.ledger-${randomUUID()}.tmp`);
  try {
    // Owner-only like the lockfile; the unique temp path guarantees the mode applies on creation.
    writeFileSync(tempPath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(tempPath, filePath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Temp file was never created or already moved/removed.
    }
    throw error;
  }
};

/** Decodes ledger bytes strictly so invalid UTF-8 is reported instead of rewritten as U+FFFD. */
const decodeLedgerBytes = (bytes: Uint8Array, filePath: string): string => {
  try {
    return strictUtf8Decoder.decode(bytes);
  } catch (error) {
    throw new Error(`Malformed decision ledger at "${filePath}": file is not valid UTF-8.`, {
      cause: error,
    });
  }
};

const isResumeStartRow = (entry: LedgerEntry): boolean =>
  entry.phase.toLowerCase() === "resume" && entry.decision.toLowerCase() === "start";

export const appendLedgerEntry = async (input: LedgerLogInput): Promise<LedgerLogResult> => {
  const filePath = resolveLedgerFilePath({
    slug: input.slug,
    file: input.file,
    repoRoot: input.repoRoot,
    cwd: input.cwd,
  });

  const ts =
    input.ts !== undefined
      ? validateTimestamp(input.ts)
      : (input.now?.() ?? new Date()).toISOString();
  const entry: LedgerEntry = ledgerEntrySchema.parse({
    ts,
    run_id: validateLedgerRunId(input.runId),
    phase: requireSanitizedCell("phase", input.phase),
    decision: requireSanitizedCell("decision", input.decision),
    why: requireSanitizedCell("why", input.why),
    evidence: sanitizeLedgerCell(input.evidence ?? ""),
    result: sanitizeLedgerCell(input.result ?? ""),
  });

  return withLedgerLock(
    filePath,
    () => {
      mkdirSync(dirname(filePath), { recursive: true });

      if (!existsSync(filePath)) {
        writeFileAtomically(filePath, `${LEDGER_HEADER}\n${formatLedgerRow(entry)}\n`);
        return ledgerLogResultSchema.parse({
          file: filePath,
          created: true,
          resumed: false,
          previousRunId: null,
          appended: [entry],
        });
      }

      const existingRaw = decodeLedgerBytes(readFileSync(filePath), filePath);
      const existingEntries = parseLedgerTsv(existingRaw, filePath);
      const previousRunId = existingEntries.at(-1)?.run_id ?? null;
      const runChanged = previousRunId !== null && previousRunId !== entry.run_id;

      const toAppend: LedgerEntry[] = [];
      if (runChanged && !isResumeStartRow(entry)) {
        toAppend.push(
          ledgerEntrySchema.parse({
            ts: entry.ts,
            run_id: entry.run_id,
            phase: "resume",
            decision: "start",
            why: "Resumed ledger with new run_id",
            evidence: sanitizeLedgerCell(previousRunId),
            result: "started",
          }),
        );
      }
      toAppend.push(entry);

      const leadingNewline = existingRaw.endsWith("\n") ? "" : "\n";
      const serialized = `${leadingNewline}${toAppend.map(formatLedgerRow).join("\n")}\n`;
      writeFileAtomically(filePath, `${existingRaw}${serialized}`);

      return ledgerLogResultSchema.parse({
        file: filePath,
        created: false,
        resumed: runChanged,
        previousRunId,
        appended: toAppend,
      });
    },
    input.lockOptions,
  );
};

export const readLedgerEntries = (
  filePath: string,
): { exists: boolean; entries: LedgerEntry[] } => {
  let bytes: Buffer;
  try {
    bytes = readFileSync(filePath);
  } catch (error) {
    if (getErrnoCode(error) === "ENOENT") {
      return { exists: false, entries: [] };
    }
    const detail = errorMessage(error);
    throw new Error(`Failed to read decision ledger at "${filePath}": ${detail}`, {
      cause: error,
    });
  }
  return { exists: true, entries: parseLedgerTsv(decodeLedgerBytes(bytes, filePath), filePath) };
};

export const tailLedger = ({
  slug,
  file,
  limit = DEFAULT_TAIL_LIMIT,
  repoRoot = REPO_ROOT,
  cwd = process.cwd(),
}: {
  slug?: string;
  file?: string;
  limit?: number;
  repoRoot?: string;
  cwd?: string;
}): LedgerTailResult => {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid --limit "${String(limit)}". Expected a positive integer.`);
  }
  const filePath = resolveLedgerFilePath({ slug, file, repoRoot, cwd });
  const { exists, entries } = readLedgerEntries(filePath);
  return ledgerTailResultSchema.parse({
    file: filePath,
    exists,
    totalEntries: entries.length,
    limit,
    entries: entries.slice(-limit),
  });
};

const toSortedCountRecord = (counts: Map<string, number>): Record<string, number> =>
  Object.fromEntries(
    [...counts.entries()]
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );

const formatDecisionBullet = (entry: LedgerEntry): string => {
  const parts = [`[${entry.phase}] ${entry.decision} — ${entry.why}`];
  if (entry.result) {
    parts.push(`(${entry.result})`);
  }
  if (entry.evidence) {
    parts.push(`[evidence: ${entry.evidence}]`);
  }
  return parts.join(" ");
};

export const summarizeLedger = ({
  slug,
  file,
  repoRoot = REPO_ROOT,
  cwd = process.cwd(),
}: {
  slug?: string;
  file?: string;
  repoRoot?: string;
  cwd?: string;
}): LedgerSummary => {
  const filePath = resolveLedgerFilePath({ slug, file, repoRoot, cwd });
  const { exists, entries } = readLedgerEntries(filePath);

  const runsById = new Map<string, LedgerRunSummary>();
  const phaseCountsMap = new Map<string, number>();
  const resultCountsMap = new Map<string, number>();
  const decisions: string[] = [];

  for (const entry of entries) {
    const existingRun = runsById.get(entry.run_id);
    if (existingRun) {
      existingRun.entryCount += 1;
      existingRun.lastTs = entry.ts;
    } else {
      runsById.set(entry.run_id, {
        run_id: entry.run_id,
        entryCount: 1,
        firstTs: entry.ts,
        lastTs: entry.ts,
      });
    }

    phaseCountsMap.set(entry.phase, (phaseCountsMap.get(entry.phase) ?? 0) + 1);
    if (entry.result) {
      resultCountsMap.set(entry.result, (resultCountsMap.get(entry.result) ?? 0) + 1);
    }

    if (!isResumeStartRow(entry)) {
      decisions.push(formatDecisionBullet(entry));
    }
  }

  return ledgerSummarySchema.parse({
    file: filePath,
    exists,
    totalEntries: entries.length,
    runs: [...runsById.values()],
    phaseCounts: toSortedCountRecord(phaseCountsMap),
    resultCounts: toSortedCountRecord(resultCountsMap),
    latestEntries: entries.slice(-SUMMARY_LATEST_LIMIT),
    decisions,
  });
};

const COMMAND_USAGE = {
  log: "(--slug <slug> | --file <path>) --run-id <id> --phase <phase> --decision <decision> --why <why> [--evidence <evidence>] [--result <result>] [--ts <iso>] [--json]",
  tail: "(--slug <slug> | --file <path>) [--limit <n>] [--json]",
  summary: "(--slug <slug> | --file <path>) [--json]",
} as const;

const TARGET_OPTIONS = {
  slug: { type: "string" },
  file: { type: "string" },
  json: { type: "boolean" },
} as const;

const ledgerUsage = (command: keyof typeof COMMAND_USAGE) =>
  `Usage: agent:ledger ${command} ${COMMAND_USAGE[command]}`;

const requireTarget = ({ slug, file }: { slug?: string; file?: string }) => {
  if (!slug && !file) {
    throw new Error("Missing --slug <slug> (or --file <path>).");
  }
  if (slug !== undefined) {
    validateLedgerSlug(slug);
  }
  return { slug, file };
};

const requireOption = (value: string | undefined, option: string): string => {
  if (!value) {
    throw new Error(`Missing required option --${option} <${option}>.`);
  }
  return value;
};

export const parseLogArgs = (args: readonly string[]): LedgerLogCliOptions => {
  const { values } = parseCliArgs(args, {
    options: {
      ...TARGET_OPTIONS,
      "run-id": { type: "string" },
      phase: { type: "string" },
      decision: { type: "string" },
      why: { type: "string" },
      evidence: { type: "string" },
      result: { type: "string" },
      ts: { type: "string" },
    },
    usage: ledgerUsage("log"),
  });
  const target = requireTarget(values);
  const runId = values["run-id"];
  if (runId === undefined) {
    throw new Error("Missing required option --run-id <id>.");
  }
  return {
    ...target,
    runId: validateLedgerRunId(runId),
    phase: requireOption(values.phase, "phase"),
    decision: requireOption(values.decision, "decision"),
    why: requireOption(values.why, "why"),
    evidence: values.evidence,
    result: values.result,
    ts: values.ts,
    json: values.json ?? false,
  };
};

export const parseTailArgs = (args: readonly string[]): LedgerTailCliOptions => {
  const { values } = parseCliArgs(args, {
    options: { ...TARGET_OPTIONS, limit: { type: "string" } },
    usage: ledgerUsage("tail"),
  });
  return {
    ...requireTarget(values),
    limit:
      values.limit === undefined ? DEFAULT_TAIL_LIMIT : parseWholeNumber(values.limit, "--limit"),
    json: values.json ?? false,
  };
};

export const parseSummaryArgs = (args: readonly string[]): LedgerSummaryCliOptions => {
  const { values } = parseCliArgs(args, { options: TARGET_OPTIONS, usage: ledgerUsage("summary") });
  return { ...requireTarget(values), json: values.json ?? false };
};

const formatEntryLine = (entry: LedgerEntry): string => {
  const details = [
    `[${entry.ts}] (${entry.run_id} / ${entry.phase}) ${entry.decision} — ${entry.why}`,
  ];
  if (entry.evidence) {
    details.push(`evidence=${entry.evidence}`);
  }
  if (entry.result) {
    details.push(`result=${entry.result}`);
  }
  return details.join(" | ");
};

export const formatLogOutput = (result: LedgerLogResult): string => {
  const lines = [
    `${result.created ? "Created" : "Appended to"} decision ledger "${result.file}" (${result.appended.length} row${result.appended.length === 1 ? "" : "s"}).`,
  ];
  if (result.resumed && result.previousRunId) {
    lines.push(`  resumed from run_id: ${result.previousRunId}`);
  }
  for (const row of result.appended) {
    lines.push(`  ${formatEntryLine(row)}`);
  }
  return lines.join("\n");
};

export const formatTailOutput = (result: LedgerTailResult): string => {
  if (!result.exists) {
    return `No decision ledger found at "${result.file}".`;
  }
  if (result.entries.length === 0) {
    return `Decision ledger "${result.file}" has no entries.`;
  }
  const header = `Showing last ${result.entries.length} of ${result.totalEntries} entries from "${result.file}":`;
  return [header, ...result.entries.map((entry) => `  ${formatEntryLine(entry)}`)].join("\n");
};

export const formatSummaryOutput = (summary: LedgerSummary): string => {
  if (!summary.exists) {
    return `No decision ledger found at "${summary.file}".`;
  }
  const lines = [
    `Decision ledger summary: "${summary.file}"`,
    `  entries: ${summary.totalEntries}`,
    `  runs (${summary.runs.length}): ${
      summary.runs.length === 0
        ? "none"
        : summary.runs
            .map((run) => `${run.run_id} (${run.entryCount}, ${run.firstTs}..${run.lastTs})`)
            .join(", ")
    }`,
  ];

  const phasePairs = Object.entries(summary.phaseCounts);
  if (phasePairs.length > 0) {
    lines.push(`  phases:  ${phasePairs.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  const resultPairs = Object.entries(summary.resultCounts);
  if (resultPairs.length > 0) {
    lines.push(`  results: ${resultPairs.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  if (summary.decisions.length > 0) {
    lines.push("  decisions:");
    for (const bullet of summary.decisions) {
      lines.push(`    - ${bullet}`);
    }
  } else {
    lines.push("  decisions: none");
  }

  return lines.join("\n");
};

const USAGE_TEXT = [
  "Usage: vp run agent:ledger -- <command> [options]",
  "",
  "Commands:",
  `  log      ${COMMAND_USAGE.log}`,
  `  tail     ${COMMAND_USAGE.tail}`,
  `  summary  ${COMMAND_USAGE.summary}`,
].join("\n");

export const executeLedgerCli = async (
  rawArgs: readonly string[],
  context: { repoRoot?: string; cwd?: string; now?: () => Date } = {},
): Promise<string> => {
  const args = stripLeadingSeparator(rawArgs);
  const [command, ...rest] = args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    return USAGE_TEXT;
  }

  if (command === "log") {
    const options = parseLogArgs(rest);
    const result = await appendLedgerEntry({
      slug: options.slug,
      file: options.file,
      runId: options.runId,
      phase: options.phase,
      decision: options.decision,
      why: options.why,
      evidence: options.evidence,
      result: options.result,
      ts: options.ts,
      repoRoot: context.repoRoot,
      cwd: context.cwd,
      now: context.now,
    });
    return options.json ? JSON.stringify(result, null, 2) : formatLogOutput(result);
  }

  if (command === "tail") {
    const options = parseTailArgs(rest);
    const result = tailLedger({
      slug: options.slug,
      file: options.file,
      limit: options.limit,
      repoRoot: context.repoRoot,
      cwd: context.cwd,
    });
    return options.json ? JSON.stringify(result, null, 2) : formatTailOutput(result);
  }

  if (command === "summary") {
    const options = parseSummaryArgs(rest);
    const result = summarizeLedger({
      slug: options.slug,
      file: options.file,
      repoRoot: context.repoRoot,
      cwd: context.cwd,
    });
    return options.json ? JSON.stringify(result, null, 2) : formatSummaryOutput(result);
  }

  throw new Error(`Unknown ledger command "${command}". Expected "log", "tail", or "summary".`);
};

const runCli = async () => {
  const output = await executeLedgerCli(process.argv.slice(2), {
    repoRoot: REPO_ROOT,
    cwd: process.cwd(),
  });
  console.log(output);
};

if (import.meta.main) {
  await runCli();
}
