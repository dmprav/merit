/**
 * Net SQL schema changes between two versions of the migrations and runtime grants, and the
 * Review Packet's summary of them: access changes in full, then one line per table.
 */

export type SqlDdlChange = {
  action: "added" | "removed";
  kind:
    | "table"
    | "column"
    | "constraint"
    | "alteration"
    | "rls"
    | "index"
    | "function"
    | "policy"
    | "trigger"
    | "grant"
    | "dynamic"
    | "other";
  summary: string;
  securityDefiner: boolean;
  /** The table a change belongs to, when the statement names one. */
  table?: string;
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

type Classified = Pick<SqlDdlChange, "kind" | "summary" | "table">;

/** Splits an `ALTER TABLE` into the per-table change it makes, keeping row-level security apart. */
const classifyAlterTable = (table: string, action: string): Classified => {
  const named = (kind: SqlDdlChange["kind"], what: string) => ({
    kind,
    summary: `ALTER TABLE ${table} ${what}`,
    table,
  });

  const rls = /^((?:ENABLE|DISABLE|FORCE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY)/iu.exec(action);
  if (rls) {
    return named("rls", (rls[1] ?? "").toUpperCase());
  }
  const column = /^(ADD|DROP|ALTER)\s+(?:COLUMN\s+)?(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([^\s,]+)/iu.exec(
    action,
  );
  const constraint = /^(ADD|DROP)\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?([^\s,]+)/iu.exec(action);
  if (constraint) {
    return named(
      "constraint",
      `${constraint[1]?.toUpperCase()} CONSTRAINT ${unquote(constraint[2])}`,
    );
  }
  if (column) {
    return named("column", `${column[1]?.toUpperCase()} COLUMN ${unquote(column[2])}`);
  }
  return named("alteration", action.length > 60 ? `${action.slice(0, 57)}...` : action);
};

const MAX_DYNAMIC_QUOTE = 70;

/** Quotes the SQL a `DO` block executes, so a reviewer sees what it does without the migration. */
const summarizeDoBlock = (statement: string): string => {
  const executed = [...statement.matchAll(/\bEXECUTE\s+(?:format\s*\(\s*)?'((?:[^']|'')*)'/giu)]
    .map((match) => normalizeSqlSummary((match[1] ?? "").replaceAll("''", "'")))
    .map((sql) =>
      sql.length > MAX_DYNAMIC_QUOTE ? `${sql.slice(0, MAX_DYNAMIC_QUOTE - 3)}...` : sql,
    );
  return executed.length > 0
    ? `DO block executing ${[...new Set(executed)].map((sql) => `\`${sql}\``).join(", ")}`
    : "DO block";
};

/** DDL statement shapes the packet reports, tried in order; the first match names the change. */
const DDL_MATCHERS: ReadonlyArray<{
  pattern: RegExp;
  classify: (match: RegExpExecArray, statement: string) => Classified;
}> = [
  {
    pattern: /^(CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([^\s(]+)/iu,
    classify: ([, verb = "", name]) => ({
      kind: "table",
      summary: `${verb.toUpperCase()} TABLE ${unquote(name)}`,
      table: unquote(name),
    }),
  },
  {
    pattern: /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([^\s]+)\s+([\s\S]*)$/iu,
    classify: ([, name, action = ""]) => classifyAlterTable(unquote(name), action),
  },
  {
    pattern:
      /^(CREATE(?:\s+UNIQUE)?|DROP)\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([^\s]+)(?:\s+ON\s+(?:ONLY\s+)?([^\s(]+))?/iu,
    classify: ([, verb = "", name, table]) => ({
      kind: "index",
      summary: `${verb.toUpperCase()} INDEX ${unquote(name)}${table ? ` ON ${unquote(table)}` : ""}`,
      table: table ? unquote(table) : undefined,
    }),
  },
  {
    pattern:
      /^(CREATE(?:\s+OR\s+REPLACE)?|DROP)\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([^\s(]+\([^)]*\))/iu,
    classify: ([, verb = "", signature]) => ({
      kind: "function",
      summary: `${verb.toUpperCase()} FUNCTION ${unquote(signature)}`,
    }),
  },
  {
    pattern: /^(CREATE|ALTER|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?([^\s]+)\s+ON\s+([^\s(]+)/iu,
    classify: ([, verb = "", name, table]) => ({
      kind: "policy",
      summary: `${verb.toUpperCase()} POLICY ${unquote(name)} ON ${unquote(table)}`,
      table: unquote(table),
    }),
  },
  {
    pattern:
      /^(CREATE|DROP)\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?([^\s]+)(?:[\s\S]*?\bON\s+([^\s(]+))?/iu,
    classify: ([, verb = "", name, table]) => ({
      kind: "trigger",
      summary: `${verb.toUpperCase()} TRIGGER ${unquote(name)}${table ? ` ON ${unquote(table)}` : ""}`,
      table: table ? unquote(table) : undefined,
    }),
  },
  {
    pattern: /^(GRANT|REVOKE)\s+(.+)$/iu,
    classify: ([, verb = "", detail = ""]) => ({
      kind: "grant",
      summary: `${verb.toUpperCase()} ${detail.length > 100 ? `${detail.slice(0, 97)}...` : detail}`,
    }),
  },
  {
    pattern: /^DO\b/iu,
    classify: (_match, statement) => ({ kind: "dynamic", summary: summarizeDoBlock(statement) }),
  },
  {
    // Anything else, such as a type, an extension, or a data backfill, is still a change to see.
    pattern: /^[\s\S]+$/u,
    classify: ([flat = ""]) => ({
      kind: "other",
      summary: flat.length > 80 ? `${flat.slice(0, 77)}...` : flat,
    }),
  },
];

const classifySqlStatement = (statement: string, action: "added" | "removed"): SqlDdlChange => {
  const flat = normalizeSqlSummary(statement);
  for (const { pattern, classify } of DDL_MATCHERS) {
    const match = pattern.exec(flat);
    if (match) {
      const classified = classify(match, statement);
      const securityDefiner =
        classified.kind === "function" && /\bSECURITY\s+DEFINER\b/iu.test(flat);
      return { action, ...classified, securityDefiner };
    }
  }
  throw new Error(`Unclassified SQL statement: ${flat}`);
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
    if (count <= 0) {
      changes.push(classifySqlStatement(statement, action));
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

/** Splits at commas outside parentheses, so `UPDATE (id, name)` and `f(uuid, text)` stay whole. */
const splitTopLevel = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    depth += char === "(" ? 1 : char === ")" ? -1 : 0;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
};

const GRANT_PATTERN =
  /^(GRANT|REVOKE)\s+(?:GRANT\s+OPTION\s+FOR\s+)?([\s\S]+?)\s+ON\s+([\s\S]+?)\s+(TO|FROM)\s+([\s\S]+?)(?:\s+WITH\s+GRANT\s+OPTION|\s+CASCADE|\s+RESTRICT)?$/iu;

const OBJECT_TYPE =
  /^(FUNCTION|PROCEDURE|ROUTINE|SEQUENCE|SCHEMA|TABLE|TYPE|DOMAIN|DATABASE|ALL\s+\w+\s+IN\s+SCHEMA)\s+/iu;

/** One privilege on one object for one role, as `GRANT` or `REVOKE` states it. */
type GrantFact = { verb: string; privilege: string; type: string; object: string; role: string };

const grantFacts = (sql: string): GrantFact[] =>
  splitSqlStatements(sql).flatMap((statement) => {
    const match = GRANT_PATTERN.exec(normalizeSqlSummary(statement));
    if (!match) {
      return [];
    }
    const [, verb = "", privileges = "", objects = "", , roles = ""] = match;
    const type = OBJECT_TYPE.exec(objects)?.[1]?.toUpperCase().replace(/\s+/gu, " ") ?? "";
    const names = splitTopLevel(type ? objects.replace(OBJECT_TYPE, "") : objects);
    return splitTopLevel(privileges).flatMap((privilege) =>
      names.flatMap((object) =>
        splitTopLevel(roles).map((role) => ({
          verb: verb.toUpperCase(),
          privilege: privilege.toUpperCase().startsWith("ALL") ? "ALL" : privilege,
          type: type === "TABLE" ? "" : type,
          object: unquote(object),
          role: unquote(role),
        })),
      ),
    );
  });

const factKey = (fact: GrantFact) =>
  [fact.verb, fact.privilege, fact.type, fact.object, fact.role].join("\u0000");

/**
 * Lists the grants and revocations that changed, regrouped into statements. A long `GRANT`
 * that gains one table reads as that one table, not as the whole statement twice.
 */
export const extractGrantDelta = (
  baseSql: string,
  headSql: string,
): Array<{ action: "added" | "removed"; statement: string }> => {
  const base = grantFacts(baseSql);
  const head = grantFacts(headSql);
  const baseKeys = new Set(base.map(factKey));
  const headKeys = new Set(head.map(factKey));
  const changed = [
    ...head
      .filter((fact) => !baseKeys.has(factKey(fact)))
      .map((fact) => ({ action: "added" as const, fact })),
    ...base
      .filter((fact) => !headKeys.has(factKey(fact)))
      .map((fact) => ({ action: "removed" as const, fact })),
  ];

  // Collect each object's privileges, then join objects that share the same privileges.
  const byObject = new Map<
    string,
    { action: "added" | "removed"; fact: GrantFact; privileges: string[] }
  >();
  for (const { action, fact } of changed) {
    const key = [action, fact.verb, fact.type, fact.object, fact.role].join("\u0000");
    const entry = byObject.get(key) ?? { action, fact, privileges: [] };
    if (!entry.privileges.includes(fact.privilege)) {
      entry.privileges.push(fact.privilege);
    }
    byObject.set(key, entry);
  }
  const statements = new Map<
    string,
    { action: "added" | "removed"; prefix: string; objects: string[]; suffix: string }
  >();
  for (const { action, fact, privileges } of byObject.values()) {
    const prefix = `${fact.verb} ${privileges.join(", ")} ON ${fact.type ? `${fact.type} ` : ""}`;
    const suffix = ` ${fact.verb === "GRANT" ? "TO" : "FROM"} ${fact.role}`;
    const key = [action, prefix, suffix].join("\u0000");
    const entry = statements.get(key) ?? { action, prefix, objects: [], suffix };
    entry.objects.push(fact.object);
    statements.set(key, entry);
  }
  return [...statements.values()].map(({ action, prefix, objects, suffix }) => ({
    action,
    statement: `${prefix}${objects.join(", ")}${suffix}`,
  }));
};

type Mark = "+" | "-" | "~";

/** Pairs an added and a removed change with the same summary into one changed (`~`) entry. */
const markChanges = (changes: readonly SqlDdlChange[]): Array<SqlDdlChange & { mark: Mark }> => {
  const removed = changes.filter((change) => change.action === "removed");
  const marked: Array<SqlDdlChange & { mark: Mark }> = [];
  const paired = new Set<SqlDdlChange>();
  for (const change of changes) {
    if (change.action !== "added") {
      continue;
    }
    const twin = removed.find(
      (other) =>
        !paired.has(other) && other.kind === change.kind && other.summary === change.summary,
    );
    if (twin) {
      paired.add(twin);
    }
    marked.push({ ...change, mark: twin ? "~" : "+" });
  }
  marked.push(
    ...removed
      .filter((change) => !paired.has(change))
      .map((change) => ({ ...change, mark: "-" as const })),
  );
  return marked;
};

const TABLE_PART_LABELS: ReadonlyArray<readonly [SqlDdlChange["kind"], string, string]> = [
  ["column", "column", "columns"],
  ["constraint", "constraint", "constraints"],
  ["index", "index", "indexes"],
  ["trigger", "trigger", "triggers"],
  ["alteration", "other change", "other changes"],
];

const MAX_TABLE_LINES = 12;
const MAX_LISTED = 12;

/** One line for a table, ranked so dropped tables come first, then new ones, then the rest. */
const describeTable = (
  table: string,
  changes: ReadonlyArray<SqlDdlChange & { mark: Mark }>,
): { line: string; rank: number } => {
  const own = changes.find((change) => change.kind === "table");
  const state =
    own?.mark === "+" ? "new" : own?.mark === "-" ? "**dropped**" : own ? "definition changed" : "";
  const parts = TABLE_PART_LABELS.flatMap(([kind, one, many]) =>
    (["+", "-", "~"] as const).flatMap((mark) => {
      const count = changes.filter((change) => change.kind === kind && change.mark === mark).length;
      return count > 0 ? [`${mark}${count} ${count === 1 ? one : many}`] : [];
    }),
  );
  // A dropped table takes its parts with it; listing them adds nothing.
  const detail = own?.mark === "-" ? [] : parts;
  return {
    line: `\`${table}\`: ${[state, detail.join(", ")].filter(Boolean).join("; ")}`,
    rank: own?.mark === "-" ? 0 : own?.mark === "+" ? 1 : 2,
  };
};

const ACCESS_KINDS = new Set<SqlDdlChange["kind"]>(["rls", "policy", "dynamic"]);

/**
 * Renders the schema delta as packet bullets. Access changes (row-level security, policies,
 * security-definer functions, grants, and `DO` blocks) are listed in full and never capped;
 * tables get one line each, and other functions and statements a capped list.
 */
export const renderSchemaDelta = ({
  baseSql,
  headSql,
}: {
  baseSql: string;
  headSql: string;
}): string[] => {
  const changes = markChanges(
    extractSqlDdlDelta(baseSql, headSql).filter((change) => change.kind !== "grant"),
  );
  const grants = extractGrantDelta(baseSql, headSql);

  const code = (mark: string, text: string) => `\`${mark}\` \`${text}\``;

  const access = [
    ...changes
      .filter((change) => ACCESS_KINDS.has(change.kind) || change.securityDefiner)
      .map((change) =>
        change.kind === "dynamic"
          ? `\`${change.mark}\` ${change.summary.replace(/^DO block/u, "`DO` block")}`
          : `${code(change.mark, change.summary)}${change.securityDefiner ? " **[SECURITY DEFINER]**" : ""}`,
      ),
    ...grants.map(({ action, statement }) => code(action === "added" ? "+" : "-", statement)),
  ];

  const byTable = new Map<string, Array<SqlDdlChange & { mark: Mark }>>();
  for (const change of changes) {
    if (change.table && !ACCESS_KINDS.has(change.kind)) {
      byTable.set(change.table, [...(byTable.get(change.table) ?? []), change]);
    }
  }
  const tables = [...byTable]
    .map(([table, tableChanges]) => describeTable(table, tableChanges))
    .sort((a, b) => a.rank - b.rank || a.line.localeCompare(b.line))
    .map(({ line }) => line);

  const functions = changes
    .filter((change) => change.kind === "function" && !change.securityDefiner)
    .map((change) =>
      code(change.mark, change.summary.replace(/^\S+(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+/u, "")),
    );
  const others = changes
    .filter(
      (change) =>
        change.kind === "other" || (!change.table && ["index", "trigger"].includes(change.kind)),
    )
    .map((change) => code(change.mark, change.summary));

  const capped = (items: readonly string[], noun: string) =>
    items.length > MAX_LISTED
      ? [...items.slice(0, MAX_LISTED), `_+${items.length - MAX_LISTED} more ${noun}_`]
      : [...items];

  const lines: string[] = [];
  if (access.length > 0) {
    lines.push("- **Access:**", ...access.map((line) => `  - ${line}`));
  }
  if (tables.length > 0) {
    const shown = tables.slice(0, MAX_TABLE_LINES);
    const hidden = tables.length - shown.length;
    lines.push(
      "- **Tables:**",
      ...shown.map((line) => `  - ${line}`),
      ...(hidden > 0 ? [`  - _+${hidden} more ${hidden === 1 ? "table" : "tables"}_`] : []),
    );
  }
  if (functions.length > 0) {
    lines.push(`- **Functions:** ${capped(functions, "functions").join(", ")}`);
  }
  if (others.length > 0) {
    lines.push(
      "- **Other statements:**",
      ...capped(others, "statements").map((line) => `  - ${line}`),
    );
  }
  if (lines.some((line) => line.includes("`~`"))) {
    lines.push("- _`~` marks a statement changed in place._");
  }
  return lines.length > 0 ? lines : ["- No net SQL DDL changes detected."];
};
