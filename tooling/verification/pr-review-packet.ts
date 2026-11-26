import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { normalizeRepoPath, readFlagValue } from "../cli.ts";
import { findProtectedPaths, parseNameStatusZ } from "./agent-policy.ts";
import { classifyChangedPaths, type MatchedMechanism } from "./architecture/mechanisms.ts";
import {
  EXEMPT_AUTHORS,
  extractRecordSections,
  isNoneSection,
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
    const parts = token.split("\t");
    const addRaw = parts[0] ?? "0";
    const delRaw = parts[1] ?? "0";
    const additions = addRaw === "-" ? 0 : Number.parseInt(addRaw, 10) || 0;
    const deletions = delRaw === "-" ? 0 : Number.parseInt(delRaw, 10) || 0;
    const inlinePath = parts[2] ?? "";

    if (inlinePath) {
      entries.push({ path: normalizeRepoPath(inlinePath), additions, deletions });
      continue;
    }

    // Rename/copy entries place old and new paths in the following two NUL-delimited tokens.
    const oldPath = tokens[index] ?? "";
    const newPath = tokens[index + 1] ?? "";
    index += 2;
    if (newPath) {
      entries.push({ path: normalizeRepoPath(newPath), additions, deletions });
    } else if (oldPath) {
      entries.push({ path: normalizeRepoPath(oldPath), additions, deletions });
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

/**
 * Splits SQL text into top-level statements while respecting comments, single-quoted
 * strings, and PostgreSQL dollar-quoted function bodies (`$$` or `$tag$`).
 */
export const splitSqlStatements = (sqlText: string): string[] => {
  const statements: string[] = [];
  let current = "";
  let index = 0;
  let inSingleQuote = false;
  let dollarTag: string | null = null;

  while (index < sqlText.length) {
    const ch = sqlText[index] ?? "";
    const next = sqlText[index + 1] ?? "";

    if (dollarTag) {
      if (sqlText.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
      } else {
        current += ch;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      index += 1;
      if (ch === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (ch === "-" && next === "-") {
      const newline = sqlText.indexOf("\n", index);
      if (newline === -1) {
        break;
      }
      index = newline + 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      const end = sqlText.indexOf("*/", index + 2);
      if (end === -1) {
        break;
      }
      index = end + 2;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      index += 1;
      continue;
    }

    if (ch === "$") {
      const tagMatch = /^\$[A-Za-z_0-9]*\$/u.exec(sqlText.slice(index));
      if (tagMatch?.[0]) {
        dollarTag = tagMatch[0];
        current += dollarTag;
        index += dollarTag.length;
        continue;
      }
    }

    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = "";
      index += 1;
      continue;
    }

    current += ch;
    index += 1;
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }
  return statements;
};

const normalizeSqlSummary = (statement: string) => statement.replace(/\s+/gu, " ").trim();

/**
 * Normalizes whitespace only outside PostgreSQL single-quoted and dollar-quoted
 * literals so literal-only changes (e.g. `'a  b'` vs `'a b'`) stay detectable.
 */
const normalizeSqlForComparison = (statement: string): string => {
  let out = "";
  let index = 0;
  let inSingleQuote = false;
  let dollarTag: string | null = null;
  let pendingSpace = false;

  while (index < statement.length) {
    const ch = statement[index] ?? "";
    const next = statement[index + 1] ?? "";

    if (dollarTag) {
      if (statement.startsWith(dollarTag, index)) {
        out += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
      } else {
        out += ch;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      out += ch;
      index += 1;
      if (ch === "'" && next === "'") {
        out += next;
        index += 1;
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (/\s/u.test(ch)) {
      pendingSpace = out.length > 0;
      index += 1;
      continue;
    }

    if (pendingSpace) {
      out += " ";
      pendingSpace = false;
    }

    if (ch === "'") {
      inSingleQuote = true;
      out += ch;
      index += 1;
      continue;
    }

    if (ch === "$") {
      const tagMatch = /^\$[A-Za-z_0-9]*\$/u.exec(statement.slice(index));
      if (tagMatch?.[0]) {
        dollarTag = tagMatch[0];
        out += dollarTag;
        index += dollarTag.length;
        continue;
      }
    }

    out += ch;
    index += 1;
  }

  return out.trim();
};

const classifySqlStatement = (
  statement: string,
  action: "added" | "removed",
): SqlDdlChange | null => {
  const flat = normalizeSqlSummary(statement);
  const securityDefiner = /\bSECURITY\s+DEFINER\b/iu.test(flat);

  const tableMatch =
    /^(CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([^\s(]+)/iu.exec(flat);
  if (tableMatch?.[1] && tableMatch[2]) {
    return {
      action,
      kind: "table",
      summary: `${tableMatch[1].toUpperCase()} TABLE ${tableMatch[2].replaceAll('"', "")}`,
      securityDefiner: false,
    };
  }

  const indexMatch =
    /^(CREATE(?:\s+UNIQUE)?|DROP)\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([^\s]+)(?:\s+ON\s+([^\s(]+))?/iu.exec(
      flat,
    );
  if (indexMatch?.[1] && indexMatch[2]) {
    const onClause = indexMatch[3] ? ` ON ${indexMatch[3].replaceAll('"', "")}` : "";
    return {
      action,
      kind: "index",
      summary: `${indexMatch[1].toUpperCase()} INDEX ${indexMatch[2].replaceAll('"', "")}${onClause}`,
      securityDefiner: false,
    };
  }

  const fnMatch =
    /^(CREATE(?:\s+OR\s+REPLACE)?|DROP)\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([^\s(]+\([^)]*\))/iu.exec(
      flat,
    );
  if (fnMatch?.[1] && fnMatch[2]) {
    return {
      action,
      kind: "function",
      summary: `${fnMatch[1].toUpperCase()} FUNCTION ${fnMatch[2].replaceAll('"', "")}`,
      securityDefiner,
    };
  }

  const policyMatch =
    /^(CREATE|ALTER|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?([^\s]+)\s+ON\s+([^\s(]+)/iu.exec(flat);
  if (policyMatch?.[1] && policyMatch[2] && policyMatch[3]) {
    return {
      action,
      kind: "policy",
      summary: `${policyMatch[1].toUpperCase()} POLICY ${policyMatch[2].replaceAll('"', "")} ON ${policyMatch[3].replaceAll('"', "")}`,
      securityDefiner: false,
    };
  }

  const triggerMatch =
    /^(CREATE|DROP)\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?([^\s]+)(?:[\s\S]*?\bON\s+([^\s(]+))?/iu.exec(
      flat,
    );
  if (triggerMatch?.[1] && triggerMatch[2]) {
    const onClause = triggerMatch[3] ? ` ON ${triggerMatch[3].replaceAll('"', "")}` : "";
    return {
      action,
      kind: "trigger",
      summary: `${triggerMatch[1].toUpperCase()} TRIGGER ${triggerMatch[2].replaceAll('"', "")}${onClause}`,
      securityDefiner: false,
    };
  }

  const grantMatch = /^(GRANT|REVOKE)\s+(.+)$/iu.exec(flat);
  if (grantMatch?.[1] && grantMatch[2]) {
    const detail = grantMatch[2].length > 100 ? `${grantMatch[2].slice(0, 97)}...` : grantMatch[2];
    return {
      action,
      kind: "grant",
      summary: `${grantMatch[1].toUpperCase()} ${detail}`,
      securityDefiner: false,
    };
  }

  return null;
};

/**
 * Compares combined base vs. head SQL so squashed migrations report only actual DDL changes.
 */
export const extractSqlDdlDelta = (baseSql: string, headSql: string): SqlDdlChange[] => {
  const baseCounts = new Map<string, number>();
  for (const stmt of splitSqlStatements(baseSql)) {
    const key = normalizeSqlForComparison(stmt);
    baseCounts.set(key, (baseCounts.get(key) ?? 0) + 1);
  }

  const headStatements = splitSqlStatements(headSql);
  const headCounts = new Map<string, number>();
  for (const stmt of headStatements) {
    const key = normalizeSqlForComparison(stmt);
    headCounts.set(key, (headCounts.get(key) ?? 0) + 1);
  }

  const changes: SqlDdlChange[] = [];

  for (const stmt of headStatements) {
    const key = normalizeSqlForComparison(stmt);
    const remaining = baseCounts.get(key) ?? 0;
    if (remaining > 0) {
      baseCounts.set(key, remaining - 1);
      continue;
    }
    const classified = classifySqlStatement(stmt, "added");
    if (classified) {
      changes.push(classified);
    }
  }

  for (const stmt of splitSqlStatements(baseSql)) {
    const key = normalizeSqlForComparison(stmt);
    const remaining = headCounts.get(key) ?? 0;
    if (remaining > 0) {
      headCounts.set(key, remaining - 1);
      continue;
    }
    const classified = classifySqlStatement(stmt, "removed");
    if (classified) {
      changes.push(classified);
    }
  }

  return changes;
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

const renderDbSection = (input: ReviewPacketInput): string[] => {
  const dbFiles = input.changedFiles.filter((file) => isDbPath(file.path));
  if (dbFiles.length === 0) {
    return [];
  }

  const migrationFiles = dbFiles.filter((file) =>
    file.path.startsWith("foundation/db/database/migrations/"),
  );
  const schemaTsFiles = dbFiles.filter((file) => file.path.endsWith(".ts"));
  const ddlChanges = [
    ...extractSqlDdlDelta(input.baseMigrationSql, input.headMigrationSql),
    ...extractSqlDdlDelta(input.baseRuntimeGrantsSql ?? "", input.headRuntimeGrantsSql ?? ""),
  ];

  const lines = ["### DB & Schema Delta"];
  if (migrationFiles.length > 0) {
    const summary = migrationFiles
      .filter((file) => file.path.endsWith(".sql"))
      .map(
        (file) =>
          `${file.status} \`${file.path.replace("foundation/db/database/migrations/", "")}\``,
      );
    if (summary.length > 0) {
      lines.push(`- **Migrations:** ${summary.join(", ")}`);
    }
  }
  if (schemaTsFiles.length > 0) {
    lines.push(
      `- **Schema modules:** ${formatCappedList([...new Set(schemaTsFiles.map((f) => f.path))].sort())}`,
    );
  }
  if (ddlChanges.length > 0) {
    for (const change of ddlChanges.slice(0, 20)) {
      const prefix = change.action === "added" ? "+" : "-";
      const badge = change.securityDefiner ? " **[SECURITY DEFINER]**" : "";
      lines.push(`- \`${prefix}\` \`${change.summary}\`${badge}`);
    }
    if (ddlChanges.length > 20) {
      lines.push(`- _+${ddlChanges.length - 20} more DDL statements_`);
    }
  } else {
    lines.push("- No net SQL DDL changes detected.");
  }
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

const renderVerificationIntegritySection = (
  changedFiles: readonly ChangedFile[],
  addedLines: readonly AddedDiffLine[],
  recordSections: Map<string, string>,
): string[] => {
  const paths = [...new Set(changedFiles.map((file) => file.path))];
  const protectedPaths = findProtectedPaths(paths);
  const ciOrCoveragePaths = paths.filter(isCiOrCoverageConfigPath).sort();
  const deletedTests = changedFiles
    .filter((file) => file.status === "deleted" && isTestPath(file.path))
    .map((file) => file.path)
    .sort();

  const suppressions: string[] = [];
  const testWeakenings: string[] = [];
  for (const entry of addedLines) {
    if (entry.path === "tooling/verification/pr-review-packet.ts") {
      continue;
    }
    if (isTestPath(entry.path)) {
      if (TEST_WEAKENING_PATTERN.test(entry.text)) {
        testWeakenings.push(`${entry.path}:${entry.line}`);
      }
      continue;
    }
    if (/\.[cm]?[jt]sx?$/u.test(entry.path) || entry.path === ".fallowrc.jsonc") {
      for (const pattern of SUPPRESSION_PATTERNS) {
        if (pattern.regex.test(entry.text)) {
          suppressions.push(`${pattern.label} at ${entry.path}:${entry.line}`);
        }
      }
    }
  }

  const bullets: string[] = [];
  if (protectedPaths.length > 0) {
    bullets.push(`- **Protected paths touched:** ${formatCappedList(protectedPaths)}`);
  }
  if (ciOrCoveragePaths.length > 0) {
    bullets.push(`- **CI / coverage / health config:** ${formatCappedList(ciOrCoveragePaths)}`);
  }
  if (suppressions.length > 0) {
    bullets.push(`- **Added suppressions / overrides:** ${formatCappedList(suppressions)}`);
  }
  if (deletedTests.length > 0) {
    bullets.push(`- **Deleted test files:** ${formatCappedList(deletedTests)}`);
  }
  if (testWeakenings.length > 0) {
    bullets.push(`- **Added skipped/focused tests:** ${formatCappedList(testWeakenings)}`);
  }

  for (const heading of ["Could not verify", "Did not verify", "Dismissed review findings"]) {
    const body = recordSections.get(heading);
    if (body && !isNoneSection(body)) {
      bullets.push(...formatRecordSectionLines(heading, body));
    }
  }

  return bullets.length > 0 ? ["### Verification Integrity", ...bullets] : [];
};

const renderUiSection = (changedFiles: readonly ChangedFile[]): string[] => {
  const paths = [...new Set(changedFiles.map((file) => file.path))];
  const uiFiles = paths.filter(isUiProdPath).sort();
  const storyFiles = paths.filter(isStoryPath).sort();
  if (uiFiles.length === 0 && storyFiles.length === 0) {
    return [];
  }

  const bullets: string[] = [];
  if (uiFiles.length > 0) {
    bullets.push(`- **UI modules (${uiFiles.length}):** ${formatCappedList(uiFiles)}`);
  }
  if (storyFiles.length > 0) {
    bullets.push(`- **Stories (${storyFiles.length}):** ${formatCappedList(storyFiles)}`);
  }
  return ["### UI Touched", ...bullets];
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

  const uiBlock = renderUiSection(input.changedFiles);
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
  if (!prNumber || !Number.isInteger(prNumber) || prNumber <= 0) {
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

const runCli = async () => {
  const args = process.argv.slice(2);
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const author = readFlagValue(args, "--author") ?? process.env.PR_AUTHOR ?? "";
  if (author && EXEMPT_AUTHORS.has(author)) {
    process.stdout.write(`Skipping Review Packet for exempt author ${author}.\n`);
    return;
  }

  const baseRef = readFlagValue(args, "--base") ?? process.env.PR_BASE_SHA ?? "origin/main";
  const headRef = readFlagValue(args, "--head") ?? process.env.PR_HEAD_SHA ?? "HEAD";
  const prRaw = readFlagValue(args, "--pr") ?? process.env.PR_NUMBER;
  const prNumber = prRaw ? Number.parseInt(prRaw, 10) : undefined;
  const shouldPost = args.includes("--post");

  const mergeBase = gitRead(repoRoot, ["merge-base", baseRef, headRef]).trim();
  const range = `${mergeBase}...${headRef}`;
  const changedFiles = parseNameStatusZ(
    gitRead(repoRoot, ["diff", "--name-status", "--find-renames", "-z", range]),
  );
  const numstat = parseNumstatZ(gitRead(repoRoot, ["diff", "--numstat", "-z", range]));
  const addedLines = parseAddedDiffLines(gitRead(repoRoot, ["diff", "-U0", range]));
  const hasDbChanges = changedFiles.some((file) => isDbPath(file.path));
  const baseMigrationSql = hasDbChanges ? readCombinedMigrationSql(repoRoot, mergeBase) : "";
  const headMigrationSql = hasDbChanges ? readCombinedMigrationSql(repoRoot, headRef) : "";
  const baseRuntimeGrantsSql = hasDbChanges
    ? readGitFileOrEmpty(repoRoot, mergeBase, "foundation/db/database/runtime-grants.sql")
    : "";
  const headRuntimeGrantsSql = hasDbChanges
    ? readGitFileOrEmpty(repoRoot, headRef, "foundation/db/database/runtime-grants.sql")
    : "";
  const record = readVerificationRecord(repoRoot, headRef, prNumber);

  const markdown = renderReviewPacket({
    changedFiles,
    numstat,
    addedLines,
    baseMigrationSql,
    headMigrationSql,
    baseRuntimeGrantsSql,
    headRuntimeGrantsSql,
    recordContent: record.content,
    recordFilePath: record.path,
  });

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }

  if (!shouldPost) {
    process.stdout.write(markdown);
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !token || !prNumber || !Number.isInteger(prNumber)) {
    throw new Error("Posting requires GITHUB_REPOSITORY, GH_TOKEN, and PR_NUMBER.");
  }

  const result = await upsertReviewPacketComment({ repo, prNumber, token, body: markdown });
  process.stdout.write(`Review Packet comment ${result.action} on ${repo}#${prNumber}.\n`);
};

if (import.meta.main) {
  await runCli();
}
