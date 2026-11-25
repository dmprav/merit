import { randomUUID } from "node:crypto";
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
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

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

const DEFAULT_REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const FORMULA_PREFIX_PATTERN = /^[=+\-@"]/;
const NON_WHITESPACE_TOKEN_PATTERN = /^\S+$/;
const LONG_OPTION_TOKEN_PATTERN = /^--[a-z0-9]/i;
const MAX_SYMLINK_HOPS = 40;
const isoTimestampSchema = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);
const POSITIVE_INT_PATTERN = /^\d+$/;

const DEFAULT_LEDGER_LOCK_INITIAL_DELAY_MS = 15;
const DEFAULT_LEDGER_LOCK_MAX_DELAY_MS = 150;

const KNOWN_CLI_FLAGS = new Set([
  "--slug",
  "--file",
  "--run-id",
  "--phase",
  "--decision",
  "--why",
  "--evidence",
  "--result",
  "--ts",
  "--limit",
  "--json",
  "--help",
  "-h",
]);

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

const requiredLedgerCellSchema = z.string().superRefine((value, ctx) => {
  if (hasControlChars(value)) {
    ctx.addIssue({ code: "custom", message: "must not contain control characters" });
    return;
  }
  if (value.trim().length === 0) {
    ctx.addIssue({ code: "custom", message: "must be non-empty" });
  }
});

const optionalLedgerCellSchema = z.string().superRefine((value, ctx) => {
  if (hasControlChars(value)) {
    ctx.addIssue({ code: "custom", message: "must not contain control characters" });
    return;
  }
  if (value.length > 0 && value.trim().length === 0) {
    ctx.addIssue({ code: "custom", message: "must not be whitespace-only" });
  }
});

const ledgerTimestampSchema = z.string().superRefine((value, ctx) => {
  if (hasControlChars(value)) {
    ctx.addIssue({ code: "custom", message: "must not contain control characters" });
    return;
  }
  if (!isValidIsoTimestamp(value)) {
    ctx.addIssue({
      code: "custom",
      message: 'must be a valid ISO-8601 timestamp (e.g. "2026-11-24T22:00:00.000Z")',
    });
  }
});

const ledgerRunIdSchema = z.string().superRefine((value, ctx) => {
  if (hasControlChars(value)) {
    ctx.addIssue({ code: "custom", message: "must not contain control characters" });
    return;
  }
  if (value.length === 0) {
    ctx.addIssue({ code: "custom", message: "must be non-empty" });
    return;
  }
  if (!NON_WHITESPACE_TOKEN_PATTERN.test(value)) {
    ctx.addIssue({
      code: "custom",
      message: "must be a single token without whitespace",
    });
    return;
  }
  if (FORMULA_PREFIX_PATTERN.test(value)) {
    ctx.addIssue({
      code: "custom",
      message: 'must not start with a spreadsheet formula character (=, +, -, @, ")',
    });
  }
});

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

const canonicalizeLedgerPath = (targetPath: string, depth = 0): string => {
  const absolute = resolve(targetPath);
  try {
    return realpathSync(absolute);
  } catch (error) {
    if (getErrnoCode(error) !== "ENOENT") {
      return absolute;
    }
  }

  // Follow a dangling symlink directly at targetPath (e.g. an alias to a not-yet-created ledger).
  if (depth < MAX_SYMLINK_HOPS) {
    try {
      if (lstatSync(absolute).isSymbolicLink()) {
        const linkTarget = readlinkSync(absolute);
        return canonicalizeLedgerPath(resolve(dirname(absolute), linkTarget), depth + 1);
      }
    } catch {
      // Fall through to ancestor canonicalization.
    }
  }

  // Walk up to the nearest existing ancestor and canonicalize it, keeping non-existent trailing segments.
  const trailingSegments: string[] = [];
  let current = absolute;
  while (true) {
    const parent = dirname(current);
    if (parent === current) {
      return absolute;
    }
    trailingSegments.push(basename(current));
    current = parent;
    try {
      const realAncestor = realpathSync(current);
      return join(realAncestor, ...trailingSegments.reverse());
    } catch (error) {
      if (getErrnoCode(error) !== "ENOENT") {
        return absolute;
      }
      if (depth < MAX_SYMLINK_HOPS) {
        try {
          if (lstatSync(current).isSymbolicLink()) {
            const linkTarget = readlinkSync(current);
            const resolvedTarget = join(
              resolve(dirname(current), linkTarget),
              ...trailingSegments.reverse(),
            );
            return canonicalizeLedgerPath(resolvedTarget, depth + 1);
          }
        } catch {
          // Continue walking up.
        }
      }
    }
  }
};

export const ledgerPathForSlug = (slug: string, repoRoot = DEFAULT_REPO_ROOT): string =>
  join(repoRoot, ".tmp", "ledgers", `${validateLedgerSlug(slug)}.tsv`);

export const resolveLedgerFilePath = ({
  slug,
  file,
  repoRoot = DEFAULT_REPO_ROOT,
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
    return canonicalizeLedgerPath(resolve(cwd, trimmed));
  }
  if (!validatedSlug) {
    throw new Error("Missing --slug <slug> (or --file <path>).");
  }
  return canonicalizeLedgerPath(join(repoRoot, ".tmp", "ledgers", `${validatedSlug}.tsv`));
};

export const ledgerLockPathForFile = (filePath: string): string => `${filePath}.lock`;

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

export const parseLedgerTsv = (content: string, filePath: string): LedgerEntry[] => {
  const normalized = content.endsWith("\r\n")
    ? content.slice(0, -2)
    : content.endsWith("\n")
      ? content.slice(0, -1)
      : content;

  if (normalized.length === 0) {
    throw new Error(`Malformed decision ledger at "${filePath}": file is empty (missing header).`);
  }

  const lines = normalized.split(/\r?\n/);
  const header = lines[0];
  if (header !== LEDGER_HEADER) {
    throw new Error(
      `Malformed decision ledger at "${filePath}": invalid header (expected "${LEDGER_HEADER}").`,
    );
  }

  const entries: LedgerEntry[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    const cols = line.split("\t");
    if (cols.length !== LEDGER_COLUMNS.length) {
      throw new Error(
        `Malformed decision ledger at "${filePath}" line ${lineNumber}: expected ${LEDGER_COLUMNS.length} tab-separated columns, found ${cols.length}.`,
      );
    }

    const parsed = ledgerEntrySchema.safeParse({
      ts: cols[0],
      run_id: cols[1],
      phase: cols[2],
      decision: cols[3],
      why: cols[4],
      evidence: cols[5],
      result: cols[6],
    });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      if (issues.length === 1 && issues[0]) {
        const column = issues[0].path.map(String).join(".");
        const fieldSuffix = column ? ` (${column})` : "";
        throw new Error(
          `Malformed decision ledger at "${filePath}" line ${lineNumber}${fieldSuffix}: ${issues[0].message}.`,
        );
      }
      const detail = issues
        .map((issue) => {
          const column = issue.path.map(String).join(".");
          return column ? `${column}: ${issue.message}` : issue.message;
        })
        .join("; ");
      throw new Error(`Malformed decision ledger at "${filePath}" line ${lineNumber}: ${detail}.`);
    }
    entries.push(parsed.data);
  }

  return entries;
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
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tempPath, content, "utf8");
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

      const existingRaw = readFileSync(filePath, "utf8");
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
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    if (getErrnoCode(error) === "ENOENT") {
      return { exists: false, entries: [] };
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read decision ledger at "${filePath}": ${detail}`, {
      cause: error,
    });
  }
  return { exists: true, entries: parseLedgerTsv(raw, filePath) };
};

export const tailLedger = ({
  slug,
  file,
  limit = DEFAULT_TAIL_LIMIT,
  repoRoot = DEFAULT_REPO_ROOT,
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
  repoRoot = DEFAULT_REPO_ROOT,
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

const stripLeadingSeparator = (args: readonly string[]): string[] =>
  args[0] === "--" ? args.slice(1) : [...args];

const splitFlagToken = (token: string): { flag: string; inlineValue?: string } => {
  const eqIndex = token.indexOf("=");
  if (eqIndex === -1) {
    return { flag: token };
  }
  return { flag: token.slice(0, eqIndex), inlineValue: token.slice(eqIndex + 1) };
};

const readOptionValue = (
  args: readonly string[],
  index: number,
  flag: string,
  inlineValue: string | undefined,
): { value: string; nextIndex: number } => {
  if (inlineValue !== undefined) {
    return { value: inlineValue, nextIndex: index };
  }
  const value = args[index + 1];
  if (value === undefined || KNOWN_CLI_FLAGS.has(splitFlagToken(value).flag)) {
    throw new Error(`${flag} requires a value.`);
  }
  if (LONG_OPTION_TOKEN_PATTERN.test(value)) {
    throw new Error(
      `${flag} requires a value (got option-like token "${value}"; use ${flag}=${value} to pass it literally).`,
    );
  }
  return { value, nextIndex: index + 1 };
};

export const parseLogArgs = (rawArgs: readonly string[]): LedgerLogCliOptions => {
  const args = stripLeadingSeparator(rawArgs);
  let slug: string | undefined;
  let file: string | undefined;
  let runId: string | undefined;
  let phase: string | undefined;
  let decision: string | undefined;
  let why: string | undefined;
  let evidence: string | undefined;
  let result: string | undefined;
  let ts: string | undefined;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? "";
    const { flag, inlineValue } = splitFlagToken(token);

    if (flag === "--json") {
      if (inlineValue !== undefined) {
        throw new Error("--json does not accept a value.");
      }
      json = true;
      continue;
    }

    if (
      flag === "--slug" ||
      flag === "--file" ||
      flag === "--run-id" ||
      flag === "--phase" ||
      flag === "--decision" ||
      flag === "--why" ||
      flag === "--evidence" ||
      flag === "--result" ||
      flag === "--ts"
    ) {
      const parsed = readOptionValue(args, index, flag, inlineValue);
      index = parsed.nextIndex;
      if (flag === "--slug") {
        slug = parsed.value;
      } else if (flag === "--file") {
        file = parsed.value;
      } else if (flag === "--run-id") {
        runId = parsed.value;
      } else if (flag === "--phase") {
        phase = parsed.value;
      } else if (flag === "--decision") {
        decision = parsed.value;
      } else if (flag === "--why") {
        why = parsed.value;
      } else if (flag === "--evidence") {
        evidence = parsed.value;
      } else if (flag === "--result") {
        result = parsed.value;
      } else if (flag === "--ts") {
        ts = parsed.value;
      }
      continue;
    }

    throw new Error(
      `Unknown argument "${token}". Usage: agent:ledger log (--slug <slug> | --file <path>) --run-id <id> --phase <phase> --decision <decision> --why <why> [--evidence <evidence>] [--result <result>] [--ts <iso>] [--json]`,
    );
  }

  if (!slug && !file) {
    throw new Error("Missing --slug <slug> (or --file <path>).");
  }
  if (slug !== undefined) {
    validateLedgerSlug(slug);
  }
  if (runId === undefined) {
    throw new Error("Missing required option --run-id <id>.");
  }
  validateLedgerRunId(runId);
  if (!phase) {
    throw new Error("Missing required option --phase <phase>.");
  }
  if (!decision) {
    throw new Error("Missing required option --decision <decision>.");
  }
  if (!why) {
    throw new Error("Missing required option --why <why>.");
  }

  return { slug, file, runId, phase, decision, why, evidence, result, ts, json };
};

export const parseTailArgs = (rawArgs: readonly string[]): LedgerTailCliOptions => {
  const args = stripLeadingSeparator(rawArgs);
  let slug: string | undefined;
  let file: string | undefined;
  let limit = DEFAULT_TAIL_LIMIT;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? "";
    const { flag, inlineValue } = splitFlagToken(token);

    if (flag === "--json") {
      if (inlineValue !== undefined) {
        throw new Error("--json does not accept a value.");
      }
      json = true;
      continue;
    }

    if (flag === "--slug" || flag === "--file" || flag === "--limit") {
      const parsed = readOptionValue(args, index, flag, inlineValue);
      index = parsed.nextIndex;
      if (flag === "--slug") {
        slug = parsed.value;
      } else if (flag === "--file") {
        file = parsed.value;
      } else {
        if (!POSITIVE_INT_PATTERN.test(parsed.value)) {
          throw new Error(`Invalid --limit "${parsed.value}". Expected a positive integer.`);
        }
        const numeric = Number.parseInt(parsed.value, 10);
        if (!Number.isSafeInteger(numeric) || numeric <= 0) {
          throw new Error(`Invalid --limit "${parsed.value}". Expected a positive integer.`);
        }
        limit = numeric;
      }
      continue;
    }

    throw new Error(
      `Unknown argument "${token}". Usage: agent:ledger tail (--slug <slug> | --file <path>) [--limit <n>] [--json]`,
    );
  }

  if (!slug && !file) {
    throw new Error("Missing --slug <slug> (or --file <path>).");
  }
  if (slug !== undefined) {
    validateLedgerSlug(slug);
  }

  return { slug, file, limit, json };
};

export const parseSummaryArgs = (rawArgs: readonly string[]): LedgerSummaryCliOptions => {
  const args = stripLeadingSeparator(rawArgs);
  let slug: string | undefined;
  let file: string | undefined;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? "";
    const { flag, inlineValue } = splitFlagToken(token);

    if (flag === "--json") {
      if (inlineValue !== undefined) {
        throw new Error("--json does not accept a value.");
      }
      json = true;
      continue;
    }

    if (flag === "--slug" || flag === "--file") {
      const parsed = readOptionValue(args, index, flag, inlineValue);
      index = parsed.nextIndex;
      if (flag === "--slug") {
        slug = parsed.value;
      } else {
        file = parsed.value;
      }
      continue;
    }

    throw new Error(
      `Unknown argument "${token}". Usage: agent:ledger summary (--slug <slug> | --file <path>) [--json]`,
    );
  }

  if (!slug && !file) {
    throw new Error("Missing --slug <slug> (or --file <path>).");
  }
  if (slug !== undefined) {
    validateLedgerSlug(slug);
  }

  return { slug, file, json };
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
  "  log      (--slug <slug> | --file <path>) --run-id <id> --phase <phase> --decision <decision> --why <why> [--evidence <evidence>] [--result <result>] [--ts <iso>] [--json]",
  "  tail     (--slug <slug> | --file <path>) [--limit <n>] [--json]",
  "  summary  (--slug <slug> | --file <path>) [--json]",
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
    repoRoot: DEFAULT_REPO_ROOT,
    cwd: process.cwd(),
  });
  console.log(output);
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  await runCli();
}
