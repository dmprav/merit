import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { z } from "zod";

import { normalizeRepoPath, parseCliArgs, parseWholeNumber } from "../cli.ts";
import { REPO_ROOT } from "../paths.ts";
import { findProtectedPaths } from "./agent-policy.ts";
import { classifyChangedPaths, type MatchedMechanism } from "./architecture/mechanisms.ts";
import {
  prScreenshotManifestSchema,
  type AffectedStoryFiles,
  type PrScreenshot,
} from "./pr-screenshots.ts";
import {
  EXEMPT_AUTHORS,
  extractRecordSections,
  isNoneSection,
  parseNameStatusZ,
  recordPath,
  type ChangedFile,
} from "./verification-record.ts";

export const REVIEW_PACKET_MARKER = "<!-- merit-review-packet -->";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const MAX_LIST_ITEMS = 12;

export type NumstatEntry = {
  path: string;
  additions: number;
  deletions: number;
};

export type DiffSizeBucket = {
  files: number;
  additions: number;
  deletions: number;
};

export type DiffSizeSummary = {
  prod: DiffSizeBucket;
  tests: DiffSizeBucket;
  docsOther: DiffSizeBucket;
};

export type SqlDdlChange = {
  action: "added" | "removed";
  kind: "table" | "index" | "function" | "policy" | "trigger" | "grant";
  summary: string;
  securityDefiner: boolean;
};

export type AddedDiffLine = {
  path: string;
  line: number;
  text: string;
};

export type ReviewPacketInput = {
  changedFiles: readonly ChangedFile[];
  numstat: readonly NumstatEntry[];
  addedLines: readonly AddedDiffLine[];
  baseMigrationSql: string;
  headMigrationSql: string;
  baseRuntimeGrantsSql?: string;
  headRuntimeGrantsSql?: string;
  recordContent?: string;
  recordFilePath?: string;
  screenshots?: readonly PrScreenshot[];
  affectedStoryFiles?: AffectedStoryFiles;
};

const isTestPath = (path: string) =>
  /\.(?:test|spec|integration|eval|stories)\.[cm]?[jt]sx?$/u.test(path) ||
  /(?:^|\/)(?:tests|testing|__mocks__|__fixtures__|fixtures)\//u.test(path);

const isDocsOrGeneratedPath = (path: string) =>
  path.endsWith(".md") ||
  path.endsWith(".mdx") ||
  path.startsWith("verifications/") ||
  path === "pnpm-lock.yaml" ||
  path.includes("/snapshots/") ||
  path.startsWith("foundation/db/database/migrations/meta/") ||
  path.endsWith(".gen.ts");

const isDbPath = (path: string) =>
  path.startsWith("foundation/db/database/") ||
  path.startsWith("foundation/db/src/") ||
  /(?:^|\/)(?:[^/]*-)?schema\.ts$/u.test(path);

const isUiProdPath = (path: string) =>
  !isTestPath(path) &&
  !isDocsOrGeneratedPath(path) &&
  (path.startsWith("foundation/ui/src/") ||
    /^capabilities\/[^/]+\/web\/src\//u.test(path) ||
    /^interfaces\/(?:product|admin)\/src\//u.test(path));

const isStoryPath = (path: string) => path.endsWith(".stories.tsx");

const isCiOrCoverageConfigPath = (path: string) =>
  path.startsWith(".github/workflows/") ||
  path === ".fallowrc.jsonc" ||
  path === "tooling/verification/coverage.ts" ||
  /(?:^|\/)vite\.config\.ts$/u.test(path) ||
  /(?:^|\/)vitest[^/]*\.ts$/u.test(path);

const numstatCount = (raw = "0") => (raw === "-" ? 0 : Number.parseInt(raw, 10) || 0);

/** Parses `git diff --numstat -z` output, including rename entries. */
export const parseNumstatZ = (raw: string): NumstatEntry[] => {
  const tokens = raw.split("\0");
  const entries: NumstatEntry[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    index += 1;
    if (!token) {
      continue;
    }
    // Only the two counts are tab-separated; a path read with -z may itself contain tabs.
    const [addRaw, delRaw, ...pathParts] = token.split("\t");
    const inlinePath = pathParts.join("\t");
    // Rename/copy entries place old and new paths in the following two NUL-delimited tokens.
    const path = inlinePath || tokens[index + 1] || tokens[index] || "";
    index += inlinePath ? 0 : 2;
    if (path) {
      entries.push({
        path: normalizeRepoPath(path),
        additions: numstatCount(addRaw),
        deletions: numstatCount(delRaw),
      });
    }
  }

  return entries;
};

/** Parses unified diff output (`git diff -U0`) into added lines with file and line numbers. */
export const parseAddedDiffLines = (unifiedDiff: string): AddedDiffLine[] => {
  const results: AddedDiffLine[] = [];
  let currentPath = "";
  let currentLine = 0;

  for (const rawLine of unifiedDiff.split(/\r?\n/)) {
    if (rawLine.startsWith("+++ b/")) {
      currentPath = normalizeRepoPath(rawLine.slice("+++ b/".length));
      continue;
    }
    if (rawLine.startsWith("+++ /dev/null")) {
      currentPath = "";
      continue;
    }
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(rawLine);
    if (hunkMatch?.[1]) {
      currentLine = Number.parseInt(hunkMatch[1], 10);
      continue;
    }
    if (!currentPath) {
      continue;
    }
    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      results.push({ path: currentPath, line: currentLine, text: rawLine.slice(1) });
      currentLine += 1;
    } else if (!rawLine.startsWith("-") && !rawLine.startsWith("\\")) {
      currentLine += 1;
    }
  }

  return results;
};

export const summarizeDiffSize = (entries: readonly NumstatEntry[]): DiffSizeSummary => {
  const summary: DiffSizeSummary = {
    prod: { files: 0, additions: 0, deletions: 0 },
    tests: { files: 0, additions: 0, deletions: 0 },
    docsOther: { files: 0, additions: 0, deletions: 0 },
  };

  for (const entry of entries) {
    const bucket = isDocsOrGeneratedPath(entry.path)
      ? summary.docsOther
      : isTestPath(entry.path)
        ? summary.tests
        : summary.prod;
    bucket.files += 1;
    bucket.additions += entry.additions;
    bucket.deletions += entry.deletions;
  }

  return summary;
};

type SqlPiece = { kind: "literal" | "comment" | "char"; text: string };

/** End of the single-quoted literal opening at `index`, past doubled quotes; unterminated runs to the end. */
const singleQuotedEnd = (sql: string, index: number): number => {
  let end = index + 1;
  while (end < sql.length) {
    if (sql[end] === "'" && sql[end + 1] === "'") {
      end += 2;
    } else if (sql[end] === "'") {
      return end + 1;
    } else {
      end += 1;
    }
  }
  return sql.length;
};

/** End of a single-quoted or dollar-quoted (`$$`, `$tag$`) literal opening at `index`, or -1. */
const quotedLiteralEnd = (sql: string, index: number): number => {
  if (sql[index] === "'") {
    return singleQuotedEnd(sql, index);
  }
  const tag = sql[index] === "$" ? /^\$[A-Za-z_0-9]*\$/u.exec(sql.slice(index))?.[0] : undefined;
  if (!tag) {
    return -1;
  }
  const close = sql.indexOf(tag, index + tag.length);
  return close === -1 ? sql.length : close + tag.length;
};

/** End of a `--` or `/* *\/` comment opening at `index`, or -1; an unterminated comment ends the text. */
const commentEnd = (sql: string, index: number): number => {
  if (sql.startsWith("--", index)) {
    const newline = sql.indexOf("\n", index);
    return newline === -1 ? sql.length : newline + 1;
  }
  if (sql.startsWith("/*", index)) {
    const end = sql.indexOf("*/", index + 2);
    return end === -1 ? sql.length : end + 2;
  }
  return -1;
};

/** Breaks SQL into quoted literals, optionally comments, and single characters of code. */
const readSqlPieces = (sql: string, { comments }: { comments: boolean }): SqlPiece[] => {
  const pieces: SqlPiece[] = [];
  let index = 0;
  while (index < sql.length) {
    const commentStop = comments ? commentEnd(sql, index) : -1;
    const literalStop = commentStop === -1 ? quotedLiteralEnd(sql, index) : -1;
    const end = Math.max(commentStop, literalStop, index + 1);
    const kind = commentStop !== -1 ? "comment" : literalStop !== -1 ? "literal" : "char";
    pieces.push({ kind, text: sql.slice(index, end) });
    index = end;
  }
  return pieces;
};

const pushTrimmed = (statements: string[], statement: string) => {
  const trimmed = statement.trim();
  if (trimmed) {
    statements.push(trimmed);
  }
};

/**
 * Splits SQL text into top-level statements while respecting comments, single-quoted
 * strings, and PostgreSQL dollar-quoted function bodies (`$$` or `$tag$`).
 */
export const splitSqlStatements = (sqlText: string): string[] => {
  const statements: string[] = [];
  let current = "";
  for (const piece of readSqlPieces(sqlText, { comments: true })) {
    if (piece.kind === "char" && piece.text === ";") {
      pushTrimmed(statements, current);
      current = "";
    } else if (piece.kind !== "comment") {
      current += piece.text;
    }
  }
  pushTrimmed(statements, current);
  return statements;
};

const normalizeSqlSummary = (statement: string) => statement.replace(/\s+/gu, " ").trim();

/**
 * Normalizes whitespace only outside PostgreSQL single-quoted and dollar-quoted
 * literals so literal-only changes (e.g. `'a  b'` vs `'a b'`) stay detectable.
 */
const normalizeSqlForComparison = (statement: string): string => {
  let out = "";
  let pendingSpace = false;
  for (const piece of readSqlPieces(statement, { comments: false })) {
    if (piece.kind === "char" && /\s/u.test(piece.text)) {
      pendingSpace = out.length > 0;
      continue;
    }
    out += pendingSpace ? ` ${piece.text}` : piece.text;
    pendingSpace = false;
  }
  return out.trim();
};

const unquote = (name = "") => name.replaceAll('"', "");

const onClause = (target: string | undefined) => (target ? ` ON ${unquote(target)}` : "");

/** DDL statement shapes the packet reports, tried in order; the first match names the change. */
const DDL_MATCHERS: ReadonlyArray<{
  kind: SqlDdlChange["kind"];
  pattern: RegExp;
  summarize: (match: RegExpExecArray) => string;
}> = [
  {
    kind: "table",
    pattern: /^(CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([^\s(]+)/iu,
    summarize: ([, verb = "", name]) => `${verb.toUpperCase()} TABLE ${unquote(name)}`,
  },
  {
    kind: "index",
    pattern:
      /^(CREATE(?:\s+UNIQUE)?|DROP)\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([^\s]+)(?:\s+ON\s+([^\s(]+))?/iu,
    summarize: ([, verb = "", name, table]) =>
      `${verb.toUpperCase()} INDEX ${unquote(name)}${onClause(table)}`,
  },
  {
    kind: "function",
    pattern:
      /^(CREATE(?:\s+OR\s+REPLACE)?|DROP)\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([^\s(]+\([^)]*\))/iu,
    summarize: ([, verb = "", signature]) => `${verb.toUpperCase()} FUNCTION ${unquote(signature)}`,
  },
  {
    kind: "policy",
    pattern: /^(CREATE|ALTER|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?([^\s]+)\s+ON\s+([^\s(]+)/iu,
    summarize: ([, verb = "", name, table]) =>
      `${verb.toUpperCase()} POLICY ${unquote(name)} ON ${unquote(table)}`,
  },
  {
    kind: "trigger",
    pattern:
      /^(CREATE|DROP)\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?([^\s]+)(?:[\s\S]*?\bON\s+([^\s(]+))?/iu,
    summarize: ([, verb = "", name, table]) =>
      `${verb.toUpperCase()} TRIGGER ${unquote(name)}${onClause(table)}`,
  },
  {
    kind: "grant",
    pattern: /^(GRANT|REVOKE)\s+(.+)$/iu,
    summarize: ([, verb = "", detail = ""]) =>
      `${verb.toUpperCase()} ${detail.length > 100 ? `${detail.slice(0, 97)}...` : detail}`,
  },
];

const classifySqlStatement = (
  statement: string,
  action: "added" | "removed",
): SqlDdlChange | null => {
  const flat = normalizeSqlSummary(statement);
  for (const { kind, pattern, summarize } of DDL_MATCHERS) {
    const match = pattern.exec(flat);
    if (match) {
      const securityDefiner = kind === "function" && /\bSECURITY\s+DEFINER\b/iu.test(flat);
      return { action, kind, summary: summarize(match), securityDefiner };
    }
  }
  return null;
};

/** Counts statements by their comparison form, so repeated statements match one for one. */
const countByComparisonKey = (statements: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const statement of statements) {
    const key = normalizeSqlForComparison(statement);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

/** Classifies the statements that have no remaining equal statement on the other side. */
const unmatchedDdl = (
  statements: readonly string[],
  counterpart: readonly string[],
  action: "added" | "removed",
): SqlDdlChange[] => {
  const remaining = countByComparisonKey(counterpart);
  const changes: SqlDdlChange[] = [];
  for (const statement of statements) {
    const key = normalizeSqlForComparison(statement);
    const count = remaining.get(key) ?? 0;
    remaining.set(key, count - 1);
    const classified = count > 0 ? null : classifySqlStatement(statement, action);
    if (classified) {
      changes.push(classified);
    }
  }
  return changes;
};

/**
 * Compares combined base vs. head SQL so squashed migrations report only actual DDL changes.
 */
export const extractSqlDdlDelta = (baseSql: string, headSql: string): SqlDdlChange[] => {
  const base = splitSqlStatements(baseSql);
  const head = splitSqlStatements(headSql);
  return [...unmatchedDdl(head, base, "added"), ...unmatchedDdl(base, head, "removed")];
};

const SUPPRESSION_PATTERNS: ReadonlyArray<{ label: string; regex: RegExp }> = [
  { label: "oxlint-disable", regex: /\boxlint-disable\b/u },
  { label: "eslint-disable", regex: /\beslint-disable\b/u },
  { label: "@ts-ignore", regex: /@ts-ignore\b/u },
  { label: "@ts-expect-error", regex: /@ts-expect-error\b/u },
  { label: "as any", regex: /\bas\s+any\b/u },
  { label: "fallow-ignore", regex: /\bfallow-ignore\b/u },
  { label: "thresholdOverrides", regex: /"thresholdOverrides"/u },
];

const TEST_WEAKENING_PATTERN = /\b(?:it|test|describe)\.(?:skip|only|todo)\s*\(/u;

const extractDependencyChanges = (addedLines: readonly AddedDiffLine[]): string[] => {
  const found = new Set<string>();
  for (const entry of addedLines) {
    if (entry.path === "pnpm-workspace.yaml") {
      const catalogMatch = /^\s+("?@?[a-z0-9._/-]+"?):\s*([0-9][^#\s]*)$/iu.exec(entry.text);
      if (catalogMatch?.[1] && catalogMatch[2]) {
        const name = catalogMatch[1].replaceAll('"', "");
        found.add(`${name}@${catalogMatch[2]}`);
      }
      continue;
    }
    if (entry.path.endsWith("package.json")) {
      const depMatch = /^\s+"(@?[a-z0-9._/-]+)":\s*"([^"]+)"/iu.exec(entry.text);
      if (
        depMatch?.[1] &&
        depMatch[2] &&
        !depMatch[1].startsWith("@merit/") &&
        depMatch[2] !== "catalog:" &&
        !["name", "version", "type", "license", "main", "module"].includes(depMatch[1]) &&
        !depMatch[1].startsWith(".") &&
        !depMatch[2].startsWith("vp ") &&
        !depMatch[2].startsWith("node ")
      ) {
        found.add(`${depMatch[1]} (${depMatch[2]})`);
      }
    }
  }
  return [...found].sort();
};

const extractAddedEnvKeys = (addedLines: readonly AddedDiffLine[]): string[] => {
  const keys = new Set<string>();
  for (const entry of addedLines) {
    if (!entry.path.endsWith(".env.example")) {
      continue;
    }
    const match = /^([A-Z][A-Z0-9_]+)=/u.exec(entry.text);
    if (match?.[1]) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
};

const formatCappedList = (items: readonly string[], limit = MAX_LIST_ITEMS): string => {
  const shown = items.slice(0, limit).map((item) => `\`${item}\``);
  if (items.length > limit) {
    shown.push(`_+${items.length - limit} more_`);
  }
  return shown.join(", ");
};

const formatSizeBucket = (label: string, bucket: DiffSizeBucket) =>
  `**${label}:** \`+${bucket.additions}/-${bucket.deletions}\` (${bucket.files} ${bucket.files === 1 ? "file" : "files"})`;

const MIGRATIONS_DIRECTORY = "foundation/db/database/migrations/";

const MAX_DDL_LINES = 20;

/** Lists changed SQL migrations, or nothing when no `.sql` migration changed. */
const migrationLines = (dbFiles: readonly ChangedFile[]): string[] => {
  const summary = dbFiles
    .filter((file) => file.path.startsWith(MIGRATIONS_DIRECTORY) && file.path.endsWith(".sql"))
    .map((file) => `${file.status} \`${file.path.replace(MIGRATIONS_DIRECTORY, "")}\``);
  return summary.length > 0 ? [`- **Migrations:** ${summary.join(", ")}`] : [];
};

const ddlLines = (ddlChanges: readonly SqlDdlChange[]): string[] => {
  if (ddlChanges.length === 0) {
    return ["- No net SQL DDL changes detected."];
  }
  const lines = ddlChanges.slice(0, MAX_DDL_LINES).map((change) => {
    const prefix = change.action === "added" ? "+" : "-";
    const badge = change.securityDefiner ? " **[SECURITY DEFINER]**" : "";
    return `- \`${prefix}\` \`${change.summary}\`${badge}`;
  });
  if (ddlChanges.length > MAX_DDL_LINES) {
    lines.push(`- _+${ddlChanges.length - MAX_DDL_LINES} more DDL statements_`);
  }
  return lines;
};

const renderDbSection = (input: ReviewPacketInput): string[] => {
  const dbFiles = input.changedFiles.filter((file) => isDbPath(file.path));
  if (dbFiles.length === 0) {
    return [];
  }

  const schemaTsFiles = dbFiles.filter((file) => file.path.endsWith(".ts"));
  const ddlChanges = [
    ...extractSqlDdlDelta(input.baseMigrationSql, input.headMigrationSql),
    ...extractSqlDdlDelta(input.baseRuntimeGrantsSql ?? "", input.headRuntimeGrantsSql ?? ""),
  ];

  const lines = ["### DB & Schema Delta", ...migrationLines(dbFiles)];
  if (schemaTsFiles.length > 0) {
    lines.push(
      `- **Schema modules:** ${formatCappedList([...new Set(schemaTsFiles.map((f) => f.path))].sort())}`,
    );
  }
  lines.push(...ddlLines(ddlChanges));
  return lines;
};

const renderContractsSection = (
  changedFiles: readonly ChangedFile[],
  addedLines: readonly AddedDiffLine[],
  matchedMechanisms: readonly MatchedMechanism[],
): string[] => {
  const paths = [...new Set(changedFiles.map((file) => file.path))];
  const authPaths = paths.filter(
    (p) =>
      !isTestPath(p) && (p.startsWith("capabilities/access/") || p.startsWith("foundation/auth/")),
  );
  const mcpPaths = paths.filter(
    (p) =>
      !isTestPath(p) && (p.startsWith("interfaces/mcp/") || /^capabilities\/[^/]+\/ai\//u.test(p)),
  );
  const emailPaths = paths.filter((p) => !isTestPath(p) && p.startsWith("interfaces/emails/"));
  const routePaths = paths.filter((p) => !isTestPath(p) && p.startsWith("app/src/routes/"));
  const deps = extractDependencyChanges(addedLines);
  const envKeys = extractAddedEnvKeys(addedLines);
  const composeTouched = paths.includes("compose.yaml");

  const bullets: string[] = [];
  if (authPaths.length > 0) {
    bullets.push(`- **Auth / access:** ${formatCappedList(authPaths.sort())}`);
  }
  if (mcpPaths.length > 0) {
    bullets.push(`- **MCP / AI surface:** ${formatCappedList(mcpPaths.sort())}`);
  }
  if (emailPaths.length > 0) {
    bullets.push(`- **Emails:** ${formatCappedList(emailPaths.sort())}`);
  }
  if (routePaths.length > 0) {
    bullets.push(`- **Routes:** ${formatCappedList(routePaths.sort())}`);
  }
  if (deps.length > 0) {
    bullets.push(`- **Dependencies added/updated:** ${formatCappedList(deps)}`);
  }
  if (composeTouched || envKeys.length > 0) {
    const parts: string[] = [];
    if (composeTouched) {
      parts.push("`compose.yaml` modified");
    }
    if (envKeys.length > 0) {
      parts.push(`env keys: ${formatCappedList(envKeys)}`);
    }
    bullets.push(`- **Runtime / infra:** ${parts.join("; ")}`);
  }
  if (matchedMechanisms.length > 0) {
    const sorted = [...matchedMechanisms].sort((a, b) =>
      a.impact === b.impact
        ? a.mechanism.id.localeCompare(b.mechanism.id)
        : a.impact === "extends"
          ? -1
          : 1,
    );
    const formatted = sorted.map((entry) => `\`${entry.mechanism.id}\` (${entry.impact})`);
    bullets.push(`- **Matched mechanisms:** ${formatted.join(", ")}`);
  }

  return bullets.length > 0 ? ["### Contracts, Auth & Mechanisms", ...bullets] : [];
};

const formatRecordSectionLines = (heading: string, body: string): string[] => {
  const rawLines = body
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (rawLines.length === 1 && !/^\s*[-*]\s+/u.test(rawLines[0] ?? "")) {
    return [`- **${heading}:** ${rawLines[0]?.trim() ?? ""}`];
  }
  return [`- **${heading}:**`, ...rawLines.map((line) => `  ${line}`)];
};

const isCodeOrHealthConfigPath = (path: string) =>
  /\.[cm]?[jt]sx?$/u.test(path) || path === ".fallowrc.jsonc";

/** Finds added suppressions in code and skipped or focused tests in test files. */
const scanAddedLines = (addedLines: readonly AddedDiffLine[]) => {
  const suppressions: string[] = [];
  const testWeakenings: string[] = [];
  for (const entry of addedLines) {
    if (entry.path === "tooling/verification/pr-review-packet.ts") {
      continue;
    }
    const location = `${entry.path}:${entry.line}`;
    if (isTestPath(entry.path)) {
      if (TEST_WEAKENING_PATTERN.test(entry.text)) {
        testWeakenings.push(location);
      }
    } else if (isCodeOrHealthConfigPath(entry.path)) {
      suppressions.push(
        ...SUPPRESSION_PATTERNS.filter(({ regex }) => regex.test(entry.text)).map(
          ({ label }) => `${label} at ${location}`,
        ),
      );
    }
  }
  return { suppressions, testWeakenings };
};

/** Renders a bullet per non-empty list, in the given order. */
const listBullets = (rows: ReadonlyArray<readonly [string, readonly string[]]>): string[] =>
  rows
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => `- **${label}:** ${formatCappedList(items)}`);

const renderVerificationIntegritySection = (
  changedFiles: readonly ChangedFile[],
  addedLines: readonly AddedDiffLine[],
  recordSections: Map<string, string>,
): string[] => {
  const paths = [...new Set(changedFiles.map((file) => file.path))];
  const deletedTests = changedFiles
    .filter((file) => file.status === "deleted" && isTestPath(file.path))
    .map((file) => file.path)
    .sort();
  const { suppressions, testWeakenings } = scanAddedLines(addedLines);

  const bullets = listBullets([
    ["Protected paths touched", findProtectedPaths(paths)],
    ["CI / coverage / health config", paths.filter(isCiOrCoverageConfigPath).sort()],
    ["Added suppressions / overrides", suppressions],
    ["Deleted test files", deletedTests],
    ["Added skipped/focused tests", testWeakenings],
  ]);

  for (const heading of ["Could not verify", "Did not verify", "Dismissed review findings"]) {
    const body = recordSections.get(heading);
    if (body && !isNoneSection(body)) {
      bullets.push(...formatRecordSectionLines(heading, body));
    }
  }

  return bullets.length > 0 ? ["### Verification Integrity", ...bullets] : [];
};

const escapeMarkdownAlt = (text: string) => text.replaceAll("[", "(").replaceAll("]", ")");

/** Says how many affected story files the screenshots cover and how directly the change reaches them. */
export const describeScreenshotCoverage = (
  screenshots: readonly PrScreenshot[],
  affected: AffectedStoryFiles,
): string => {
  const shown = new Set(screenshots.map((shot) => shot.storyFile)).size;
  const total = Math.max(affected.storyFiles, shown);
  const files = total === 1 ? "story file" : "story files";
  const reach =
    affected.directStoryFiles === 0
      ? "None imports a changed module directly; each reaches the change through shared code."
      : `${affected.directStoryFiles} changed or ${affected.directStoryFiles === 1 ? "imports" : "import"} a changed module directly.`;
  return `_Showing ${shown} of ${total} affected ${files}, nearest to the change first. ${reach}_`;
};

const renderUiSection = (
  changedFiles: readonly ChangedFile[],
  screenshots: readonly PrScreenshot[] = [],
  affected?: AffectedStoryFiles,
): string[] => {
  const paths = [...new Set(changedFiles.map((file) => file.path))];
  const uiFiles = paths.filter(isUiProdPath).sort();
  const storyFiles = paths.filter(isStoryPath).sort();
  if (uiFiles.length === 0 && storyFiles.length === 0 && screenshots.length === 0) {
    return [];
  }

  const lines: string[] = ["### UI Touched"];
  if (uiFiles.length > 0) {
    lines.push(`- **UI modules (${uiFiles.length}):** ${formatCappedList(uiFiles)}`);
  }
  if (storyFiles.length > 0) {
    lines.push(`- **Stories (${storyFiles.length}):** ${formatCappedList(storyFiles)}`);
  }
  if (screenshots.length > 0) {
    lines.push("", "#### Desktop Screenshots");
    if (affected) {
      lines.push("", describeScreenshotCoverage(screenshots, affected));
    }
    for (const shot of screenshots) {
      const label = shot.title ? `${shot.title} — ${shot.name}` : shot.storyId;
      const status = shot.passed ? "passed" : "audit warnings";
      lines.push(
        "",
        `**${label}** (\`${shot.storyId}\` · ${status})`,
        `![${escapeMarkdownAlt(label)}](${shot.url})`,
      );
    }
  }
  return lines;
};

/** Renders the complete exception-only sticky PR Review Packet markdown. */
export const renderReviewPacket = (input: ReviewPacketInput): string => {
  const size = summarizeDiffSize(input.numstat);
  const paths = [...new Set(input.changedFiles.map((file) => file.path))];
  const mechanisms = classifyChangedPaths({ paths });
  const recordSections = input.recordContent
    ? extractRecordSections(input.recordContent)
    : new Map<string, string>();

  const blocks: string[][] = [];

  const behavioral = recordSections.get("Behavioral decisions");
  if (behavioral && !isNoneSection(behavioral)) {
    blocks.push(["### Behavioral Decisions", behavioral]);
  }

  const dbBlock = renderDbSection(input);
  if (dbBlock.length > 0) {
    blocks.push(dbBlock);
  }

  const uiBlock = renderUiSection(input.changedFiles, input.screenshots, input.affectedStoryFiles);
  if (uiBlock.length > 0) {
    blocks.push(uiBlock);
  }

  const contractsBlock = renderContractsSection(
    input.changedFiles,
    input.addedLines,
    mechanisms.matched,
  );
  if (contractsBlock.length > 0) {
    blocks.push(contractsBlock);
  }

  const integrityBlock = renderVerificationIntegritySection(
    input.changedFiles,
    input.addedLines,
    recordSections,
  );
  if (integrityBlock.length > 0) {
    blocks.push(integrityBlock);
  }

  const header = [
    REVIEW_PACKET_MARKER,
    "## Review Packet",
    "",
    `${formatSizeBucket("Prod", size.prod)} · ${formatSizeBucket("Tests", size.tests)} · ${formatSizeBucket("Docs/other", size.docsOther)}`,
  ];

  if (blocks.length === 0) {
    header.push(
      "",
      "No behavioral decisions, DB/schema deltas, UI changes, contract/auth touches, or verification-integrity flags detected.",
    );
    return `${header.join("\n")}\n`;
  }

  return `${header.join("\n")}\n\n${blocks.map((block) => block.join("\n")).join("\n\n")}\n`;
};

const parseNextLink = (linkHeader: string | null): string | null => {
  if (!linkHeader) {
    return null;
  }
  const match = /<([^>]+)>;\s*rel="next"/u.exec(linkHeader);
  return match?.[1] ?? null;
};

const DEFAULT_PUBLISHER_LOGIN = "github-actions[bot]";

const issueCommentSchema = z.object({
  id: z.number(),
  body: z.string().nullable().optional(),
  user: z.object({ login: z.string() }).nullable().optional(),
});

const issueCommentListSchema = z.array(issueCommentSchema);

/** Creates or updates the single sticky Review Packet comment on a pull request. */
export const upsertReviewPacketComment = async ({
  repo,
  prNumber,
  token,
  body,
  authorLogin = DEFAULT_PUBLISHER_LOGIN,
  fetchImpl = fetch,
}: {
  repo: string;
  prNumber: number;
  token: string;
  body: string;
  authorLogin?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ action: "created" | "updated"; id?: number }> => {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "Content-Type": "application/json",
  };

  let existingId: number | undefined;
  let nextUrl: string | null =
    `${GITHUB_API_BASE}/repos/${repo}/issues/${prNumber}/comments?per_page=100`;

  while (nextUrl && existingId === undefined) {
    const response = await fetchImpl(nextUrl, { method: "GET", headers });
    if (!response.ok) {
      throw new Error(`Failed to list PR comments (${response.status}): ${await response.text()}`);
    }
    const comments = issueCommentListSchema.parse(await response.json());
    const match = comments.find(
      (comment) =>
        comment.user?.login === authorLogin && comment.body?.includes(REVIEW_PACKET_MARKER),
    );
    if (match) {
      existingId = match.id;
      break;
    }
    nextUrl = parseNextLink(response.headers.get("link"));
  }

  if (existingId !== undefined) {
    const response = await fetchImpl(
      `${GITHUB_API_BASE}/repos/${repo}/issues/comments/${existingId}`,
      { method: "PATCH", headers, body: JSON.stringify({ body }) },
    );
    if (!response.ok) {
      throw new Error(`Failed to update PR comment (${response.status}): ${await response.text()}`);
    }
    return { action: "updated", id: existingId };
  }

  const response = await fetchImpl(`${GITHUB_API_BASE}/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create PR comment (${response.status}): ${await response.text()}`);
  }
  const created = issueCommentSchema.safeParse(await response.json());
  return { action: "created", id: created.success ? created.data.id : undefined };
};

const gitRead = (repoRoot: string, args: readonly string[]): string =>
  execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

const readGitFileOrEmpty = (repoRoot: string, ref: string, path: string): string => {
  try {
    return gitRead(repoRoot, ["show", `${ref}:${path}`]);
  } catch {
    return "";
  }
};

const readCombinedMigrationSql = (repoRoot: string, ref: string): string => {
  let listing = "";
  try {
    listing = gitRead(repoRoot, [
      "ls-tree",
      "-r",
      "--name-only",
      ref,
      "foundation/db/database/migrations",
    ]);
  } catch {
    return "";
  }
  const sqlFiles = listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".sql"))
    .sort();
  return sqlFiles.map((file) => readGitFileOrEmpty(repoRoot, ref, file)).join("\n");
};

const readVerificationRecord = (
  repoRoot: string,
  headRef: string,
  prNumber: number | undefined,
): { content?: string; path?: string } => {
  if (!prNumber) {
    return {};
  }
  const path = recordPath(prNumber);
  if (headRef === "HEAD") {
    const abs = join(repoRoot, path);
    if (existsSync(abs)) {
      return { content: readFileSync(abs, "utf8"), path };
    }
  }
  const content = readGitFileOrEmpty(repoRoot, headRef, path);
  return content ? { content, path } : {};
};

const REVIEW_PACKET_USAGE =
  "Usage: pr-review-packet.ts [--base <ref>] [--head <ref>] [--pr <number>] [--author <login>] [--screenshots-manifest <path>] [--post]";

export type ReviewPacketCliOptions = {
  author: string;
  baseRef: string;
  headRef: string;
  prNumber: number | undefined;
  screenshotsManifest: string | undefined;
  post: boolean;
};

/**
 * Reads the packet's flags strictly, falling back to the pull request environment CI sets;
 * a malformed `--pr` or `PR_NUMBER` is an error rather than a missing record.
 */
export const parseReviewPacketArgs = (
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ReviewPacketCliOptions => {
  const { values } = parseCliArgs(args, {
    options: {
      author: { type: "string" },
      base: { type: "string" },
      head: { type: "string" },
      pr: { type: "string" },
      "screenshots-manifest": { type: "string" },
      post: { type: "boolean" },
    },
    usage: REVIEW_PACKET_USAGE,
  });
  const prRaw = values.pr ?? env.PR_NUMBER;
  return {
    author: values.author ?? env.PR_AUTHOR ?? "",
    baseRef: values.base ?? env.PR_BASE_SHA ?? "origin/main",
    headRef: values.head ?? env.PR_HEAD_SHA ?? "HEAD",
    prNumber: prRaw ? parseWholeNumber(prRaw, values.pr ? "--pr" : "PR_NUMBER") : undefined,
    screenshotsManifest: values["screenshots-manifest"],
    post: values.post ?? false,
  };
};

/** Dependency bots get no packet; CI still needs `has_ui_changes` to skip the screenshot job. */
const skipsExemptAuthor = (author: string): boolean => {
  if (!author || !EXEMPT_AUTHORS.has(author)) {
    return false;
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, "has_ui_changes=false\n");
  }
  process.stdout.write(`Skipping Review Packet for exempt author ${author}.\n`);
  return true;
};

const RUNTIME_GRANTS_PATH = "foundation/db/database/runtime-grants.sql";

/** Reads the pull request's diff against the merge base of its base and head. */
const readPullRequestDiff = (baseRef: string, headRef: string) => {
  const mergeBase = gitRead(REPO_ROOT, ["merge-base", baseRef, headRef]).trim();
  const range = `${mergeBase}...${headRef}`;
  return {
    mergeBase,
    changedFiles: parseNameStatusZ(
      gitRead(REPO_ROOT, ["diff", "--name-status", "--find-renames", "-z", range]),
    ),
    numstat: parseNumstatZ(gitRead(REPO_ROOT, ["diff", "--numstat", "-z", range])),
    addedLines: parseAddedDiffLines(gitRead(REPO_ROOT, ["diff", "-U0", range])),
  };
};

/** Reads base and head SQL only when database files changed, since the packet compares them then. */
const readDatabaseSql = (hasDbChanges: boolean, mergeBase: string, headRef: string) =>
  hasDbChanges
    ? {
        baseMigrationSql: readCombinedMigrationSql(REPO_ROOT, mergeBase),
        headMigrationSql: readCombinedMigrationSql(REPO_ROOT, headRef),
        baseRuntimeGrantsSql: readGitFileOrEmpty(REPO_ROOT, mergeBase, RUNTIME_GRANTS_PATH),
        headRuntimeGrantsSql: readGitFileOrEmpty(REPO_ROOT, headRef, RUNTIME_GRANTS_PATH),
      }
    : {
        baseMigrationSql: "",
        headMigrationSql: "",
        baseRuntimeGrantsSql: "",
        headRuntimeGrantsSql: "",
      };

/** Reads published screenshots from the manifest `pr-screenshots.ts publish` wrote, when it exists. */
const readScreenshotManifest = (manifestFlag: string | undefined) => {
  const manifestPath = manifestFlag ? resolve(REPO_ROOT, manifestFlag) : undefined;
  if (!manifestPath || !existsSync(manifestPath)) {
    return { screenshots: [], affectedStoryFiles: undefined };
  }
  const parsed = prScreenshotManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  return { screenshots: parsed.screenshots, affectedStoryFiles: parsed.affected };
};

const appendGitHubFile = (name: "GITHUB_OUTPUT" | "GITHUB_STEP_SUMMARY", text: string) => {
  const file = process.env[name];
  if (file) {
    appendFileSync(file, text);
  }
};

const postReviewPacket = async (prNumber: number | undefined, markdown: string) => {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !token || !prNumber) {
    throw new Error("Posting requires GITHUB_REPOSITORY, GH_TOKEN, and PR_NUMBER.");
  }
  const result = await upsertReviewPacketComment({ repo, prNumber, token, body: markdown });
  process.stdout.write(`Review Packet comment ${result.action} on ${repo}#${prNumber}.\n`);
};

const runCli = async () => {
  const options = parseReviewPacketArgs(process.argv.slice(2));
  if (skipsExemptAuthor(options.author)) {
    return;
  }

  const diff = readPullRequestDiff(options.baseRef, options.headRef);
  const hasUiChanges = diff.changedFiles.some(
    (file) => file.status !== "deleted" && (isUiProdPath(file.path) || isStoryPath(file.path)),
  );
  appendGitHubFile("GITHUB_OUTPUT", `has_ui_changes=${hasUiChanges ? "true" : "false"}\n`);

  const hasDbChanges = diff.changedFiles.some((file) => isDbPath(file.path));
  const record = readVerificationRecord(REPO_ROOT, options.headRef, options.prNumber);
  const markdown = renderReviewPacket({
    ...diff,
    ...readDatabaseSql(hasDbChanges, diff.mergeBase, options.headRef),
    recordContent: record.content,
    recordFilePath: record.path,
    ...readScreenshotManifest(options.screenshotsManifest),
  });
  appendGitHubFile("GITHUB_STEP_SUMMARY", `${markdown}\n`);

  if (options.post) {
    await postReviewPacket(options.prNumber, markdown);
  } else {
    process.stdout.write(markdown);
  }
};

if (import.meta.main) {
  await runCli();
}
