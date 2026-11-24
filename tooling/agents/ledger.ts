import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

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
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;
const POSITIVE_INT_PATTERN = /^\d+$/;

const DEFAULT_LOCK_TIMEOUT_MS = 15_000;
const DEFAULT_LOCK_STALE_MS = 30_000;
const DEFAULT_LOCK_INITIAL_DELAY_MS = 15;
const DEFAULT_LOCK_MAX_DELAY_MS = 150;
const LOCK_WRITE_GRACE_MS = 1_000;

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

const lockMetadataSchema = z.object({
  pid: z.number().int().positive(),
  token: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
});

export const ledgerEntrySchema = z.object({
  ts: z.string().min(1),
  run_id: z.string().min(1),
  phase: z.string().min(1),
  decision: z.string().min(1),
  why: z.string().min(1),
  evidence: z.string(),
  result: z.string(),
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

export const ledgerSummarySchema = z.object({
  file: z.string().min(1),
  exists: z.boolean(),
  totalEntries: z.number().int().nonnegative(),
  runs: z.array(ledgerRunSummarySchema),
  phaseCounts: z.record(z.string(), z.number().int().positive()),
  resultCounts: z.record(z.string(), z.number().int().positive()),
  latestEntries: z.array(ledgerEntrySchema),
  decisions: z.array(z.string().min(1)),
});

export type LedgerSummary = z.infer<typeof ledgerSummarySchema>;

export type LedgerLockOptions = {
  timeoutMs?: number;
  staleMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
};

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
    return resolve(cwd, trimmed);
  }
  if (!validatedSlug) {
    throw new Error("Missing --slug <slug> (or --file <path>).");
  }
  return join(repoRoot, ".tmp", "ledgers", `${validatedSlug}.tsv`);
};

export const ledgerLockPathForFile = (filePath: string): string => `${filePath}.lock`;

const replaceControlCharsWithSpace = (value: string): string => {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isControl = code <= 0x1f || code === 0x7f || code === 0x2028 || code === 0x2029;
    result += isControl ? " " : value[index];
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
  if (!ISO_TIMESTAMP_PATTERN.test(trimmed) || !Number.isFinite(Date.parse(trimmed))) {
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
      const detail = parsed.error.issues.map((issue) => issue.message).join("; ");
      throw new Error(`Malformed decision ledger at "${filePath}" line ${lineNumber}: ${detail}.`);
    }
    entries.push(parsed.data);
  }

  return entries;
};

const getErrnoCode = (error: unknown): string | undefined => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
};

const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return getErrnoCode(error) === "EPERM";
  }
};

const tryClearStaleLock = (lockPath: string, staleMs: number): boolean => {
  let raw: string;
  let mtimeMs: number;
  try {
    const stat = statSync(lockPath);
    mtimeMs = stat.mtimeMs;
    raw = readFileSync(lockPath, "utf8");
  } catch {
    return false;
  }

  const ageMs = Date.now() - mtimeMs;
  const corruptGraceMs = Math.min(staleMs, LOCK_WRITE_GRACE_MS);
  let stale = false;
  if (raw.trim().length > 0) {
    try {
      const parsed = lockMetadataSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        // Never expire valid lock metadata solely by age while its owner process is still alive.
        stale = !isProcessAlive(parsed.data.pid);
      } else {
        stale = ageMs >= corruptGraceMs;
      }
    } catch {
      stale = ageMs >= corruptGraceMs;
    }
  } else {
    stale = ageMs >= corruptGraceMs;
  }

  if (!stale) {
    return false;
  }

  try {
    if (readFileSync(lockPath, "utf8") === raw) {
      unlinkSync(lockPath);
      return true;
    }
  } catch {
    // Another process already removed or replaced it.
  }
  return false;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const withLedgerLock = async <T>(
  filePath: string,
  operation: () => Promise<T> | T,
  options: LedgerLockOptions = {},
): Promise<T> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_LOCK_INITIAL_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_LOCK_MAX_DELAY_MS;

  const lockPath = ledgerLockPathForFile(filePath);
  mkdirSync(dirname(lockPath), { recursive: true });

  const token = randomUUID();
  const payload = `${JSON.stringify({ pid: process.pid, token, createdAt: Date.now() })}\n`;
  const deadline = Date.now() + timeoutMs;
  let delayMs = initialDelayMs;
  let acquired = false;

  while (!acquired) {
    try {
      const fd = openSync(
        lockPath,
        fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
        0o600,
      );
      try {
        writeFileSync(fd, payload, "utf8");
      } finally {
        closeSync(fd);
      }
      acquired = true;
    } catch (error) {
      if (getErrnoCode(error) !== "EEXIST") {
        throw error;
      }
      if (tryClearStaleLock(lockPath, staleMs)) {
        continue;
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error(
          `Timed out waiting for decision ledger lock at "${lockPath}" after ${timeoutMs}ms.`,
        );
      }
      await sleep(Math.min(delayMs, remainingMs));
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }

  try {
    return await operation();
  } finally {
    try {
      if (readFileSync(lockPath, "utf8") === payload) {
        unlinkSync(lockPath);
      }
    } catch {
      // Lock file already removed.
    }
  }
};

const isResumeStartRow = (entry: LedgerEntry): boolean => entry.decision.toLowerCase() === "start";

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
    run_id: requireSanitizedCell("run_id", input.runId),
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
        const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
        writeFileSync(tempPath, `${LEDGER_HEADER}\n${formatLedgerRow(entry)}\n`, "utf8");
        renameSync(tempPath, filePath);
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
      appendFileSync(filePath, serialized, "utf8");

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

const toSortedCountRecord = (counts: Map<string, number>): Record<string, number> => {
  const sorted: Record<string, number> = {};
  for (const key of [...counts.keys()].sort()) {
    const count = counts.get(key);
    if (count !== undefined && count > 0) {
      sorted[key] = count;
    }
  }
  return sorted;
};

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

    if (!(entry.phase === "resume" && entry.decision === "start")) {
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
  if (value === undefined || KNOWN_CLI_FLAGS.has(value)) {
    throw new Error(`${flag} requires a value.`);
  }
  return { value, nextIndex: index + 1 };
};

const splitFlagToken = (token: string): { flag: string; inlineValue?: string } => {
  const eqIndex = token.indexOf("=");
  if (eqIndex === -1) {
    return { flag: token };
  }
  return { flag: token.slice(0, eqIndex), inlineValue: token.slice(eqIndex + 1) };
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
      `Unknown argument "${token}". Usage: agent:ledger log --slug <slug> [--file <path>] --run-id <id> --phase <phase> --decision <decision> --why <why> [--evidence <evidence>] [--result <result>] [--ts <iso>] [--json]`,
    );
  }

  if (!slug && !file) {
    throw new Error("Missing --slug <slug> (or --file <path>).");
  }
  if (slug !== undefined) {
    validateLedgerSlug(slug);
  }
  if (!runId) {
    throw new Error("Missing required option --run-id <id>.");
  }
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
      `Unknown argument "${token}". Usage: agent:ledger tail --slug <slug> [--file <path>] [--limit <n>] [--json]`,
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
      `Unknown argument "${token}". Usage: agent:ledger summary --slug <slug> [--file <path>] [--json]`,
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
  "  log      --slug <slug> [--file <path>] --run-id <id> --phase <phase> --decision <decision> --why <why> [--evidence <evidence>] [--result <result>] [--ts <iso>] [--json]",
  "  tail     --slug <slug> [--file <path>] [--limit <n>] [--json]",
  "  summary  --slug <slug> [--file <path>] [--json]",
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
