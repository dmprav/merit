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
  /** Whether the statement removes what it names, such as a `DROP`, so its effect is a removal. */
  drops?: boolean;
  /** Whether it changes who can read, write, or run something, so a reviewer must see it whole. */
  access?: boolean;
  /** What to compare when the statement changes in place: table items, or a `DO` block's literals. */
  parts?: string[];
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

/** Splits at commas outside parentheses, so `UPDATE (id, name)` and `f(uuid, text)` stay whole. */
const splitTopLevel = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const piece of readSqlPieces(text, { comments: false })) {
    if (piece.kind === "char") {
      depth += piece.text === "(" ? 1 : piece.text === ")" ? -1 : 0;
      if (piece.text === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }
    current += piece.text;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
};

type Classified = Omit<SqlDdlChange, "action" | "securityDefiner"> & { securityDefiner?: boolean };

const MAX_OTHER_SUMMARY = 120;

const clip = (text: string, limit: number) =>
  text.length > limit ? `${text.slice(0, limit - 3)}...` : text;

const TABLE_CONSTRAINT =
  /^(?:CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|EXCLUDE|LIKE)\b/iu;

/** One `ALTER TABLE` action, such as `ADD COLUMN x` or `ENABLE ROW LEVEL SECURITY`. */
const classifyAlterTablePart = (table: string, part: string): Classified => {
  const named = (kind: SqlDdlChange["kind"], what: string, extra: Partial<Classified> = {}) => ({
    kind,
    summary: `ALTER TABLE ${table} ${what}`,
    table,
    ...extra,
  });

  const rls = /^((?:ENABLE|DISABLE|FORCE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY)$/iu.exec(part);
  if (rls) {
    return named("rls", (rls[1] ?? "").toUpperCase().replace(/\s+/gu, " "), { access: true });
  }
  // Disabling a trigger can switch off an immutability or authorship guard; ownership moves rights.
  if (/^DISABLE\s+(?:ALWAYS\s+|REPLICA\s+)?TRIGGER\b|\bOWNER\s+TO\b/iu.test(part)) {
    return named("alteration", part, { access: true });
  }
  const added =
    /^ADD\s+(?:CONSTRAINT\s+(\S+)\s+)?(PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|EXCLUDE)\b/iu.exec(
      part,
    );
  if (added) {
    const name = added[1] ? unquote(added[1]) : (added[2] ?? "").toUpperCase();
    return named("constraint", `ADD CONSTRAINT ${name}`);
  }
  const constraint = /^(DROP|ALTER|VALIDATE|RENAME)\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(\S+)/iu.exec(
    part,
  );
  if (constraint) {
    const verb = (constraint[1] ?? "").toUpperCase();
    return named("constraint", `${verb} CONSTRAINT ${unquote(constraint[2])}`, {
      drops: verb === "DROP",
    });
  }
  const column =
    /^(ADD|DROP|ALTER|RENAME)\s+(?:COLUMN\s+)?(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(\S+)(\s+TO\s+\S+)?/iu.exec(
      part,
    );
  // `RENAME TO x` renames the table itself, not a column.
  if (column && !/^RENAME\s+TO\b/iu.test(part)) {
    const verb = (column[1] ?? "").toUpperCase();
    return named("column", `${verb} COLUMN ${unquote(column[2])}`, { drops: verb === "DROP" });
  }
  return named("alteration", clip(part, 60));
};

/** The items of a `CREATE TABLE` body, keyed so a column changed in place keeps its name. */
const tableItems = (flat: string): string[] => {
  const open = flat.indexOf("(");
  const close = flat.lastIndexOf(")");
  if (open === -1 || close <= open) {
    return [];
  }
  return splitTopLevel(flat.slice(open + 1, close)).map((item) =>
    TABLE_CONSTRAINT.test(item)
      ? `constraint\u0000${item}\u0000${item}`
      : `column\u0000${unquote(item.split(/\s+/u)[0])}\u0000${item}`,
  );
};

/** Text inside the quoted literals of `sql`, such as table names in an `ARRAY[...]`. */
const literalsOf = (sql: string): string[] =>
  readSqlPieces(sql, { comments: true })
    .filter((piece) => piece.kind === "literal")
    .map((piece) =>
      piece.text.startsWith("'")
        ? piece.text.slice(1, -1).replaceAll("''", "'")
        : piece.text.replace(/^\$[A-Za-z_0-9]*\$|\$[A-Za-z_0-9]*\$$/gu, ""),
    );

const DDL_KEYWORD = /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\s+\w/iu;

/**
 * Quotes the SQL a `DO` block runs: the strings its `EXECUTE` calls run and the DDL written in
 * its body. A migration can create policies this way, out of reach of any statement pattern.
 */
const summarizeDoBlock = (statement: string): Classified => {
  const body = /^DO\s+(\$[A-Za-z_0-9]*\$)([\s\S]*)\1/iu.exec(statement.trim())?.[2] ?? "";
  const executed = [
    ...body.matchAll(
      /\bEXECUTE\s+(?:format\s*\(\s*)?('(?:[^']|'')*'|(\$[A-Za-z_0-9]*\$)[\s\S]*?\2)/giu,
    ),
  ].map((match) => literalsOf(match[1] ?? "")[0] ?? "");
  const direct = splitSqlStatements(body).flatMap((piece) => {
    const code = readSqlPieces(piece, { comments: false })
      .map((part) => (part.kind === "literal" ? " ".repeat(part.text.length) : part.text))
      .join("");
    const at = code.search(DDL_KEYWORD);
    return at === -1 || /\bEXECUTE\b/iu.test(code.slice(0, at)) ? [] : [piece.slice(at)];
  });
  const quoted = [...new Set([...executed, ...direct].map(normalizeSqlSummary).filter(Boolean))];
  return {
    kind: "dynamic",
    summary:
      quoted.length > 0
        ? `DO block running ${quoted.map((sql) => `\`${sql}\``).join(", ")}`
        : "DO block that runs no SQL the summary can quote; read it in the migration",
    access: true,
    parts: literalsOf(body).map(normalizeSqlSummary),
  };
};

/** Statements that change access however they are written: roles, views, default privileges. */
const ACCESS_STATEMENT =
  /^(?:(?:CREATE|ALTER|DROP)\s+ROLE\b|ALTER\s+DEFAULT\s+PRIVILEGES\b|CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\b|ALTER\s+(?:FUNCTION|PROCEDURE|ROUTINE)\b|ALTER\b[\s\S]*\bOWNER\s+TO\b)/iu;

/** DDL statement shapes the packet reports, tried in order; the first match names the change. */
const DDL_MATCHERS: ReadonlyArray<{
  pattern: RegExp;
  classify: (match: RegExpExecArray, statement: string) => Classified[];
}> = [
  {
    pattern: /^(CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([^\s(]+)/iu,
    classify: ([, verb = "", name], statement) => [
      {
        kind: "table",
        summary: `${verb.toUpperCase()} TABLE ${unquote(name)}`,
        table: unquote(name),
        drops: verb.toUpperCase() === "DROP",
        parts: verb.toUpperCase() === "CREATE" ? tableItems(normalizeSqlSummary(statement)) : [],
      },
    ],
  },
  {
    pattern: /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([^\s]+)\s+([\s\S]*)$/iu,
    classify: ([, name, actions = ""]) =>
      splitTopLevel(actions).map((part) => classifyAlterTablePart(unquote(name), part)),
  },
  {
    pattern:
      /^(CREATE(?:\s+UNIQUE)?|DROP)\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([^\s]+)(?:\s+ON\s+(?:ONLY\s+)?([^\s(]+))?/iu,
    classify: ([, verb = "", name, table]) => [
      {
        kind: "index",
        summary: `${verb.toUpperCase().replace(/\s+/gu, " ")} INDEX ${unquote(name)}${table ? ` ON ${unquote(table)}` : ""}`,
        table: table ? unquote(table) : undefined,
        drops: verb.toUpperCase() === "DROP",
      },
    ],
  },
  {
    pattern:
      /^(CREATE(?:\s+OR\s+REPLACE)?|DROP)\s+(FUNCTION|PROCEDURE)\s+(?:IF\s+EXISTS\s+)?([^\s(]+)\s*(\([^)]*\))?/iu,
    classify: ([, verb = "", type = "", name, args = ""], statement) => {
      const securityDefiner = /\bSECURITY\s+DEFINER\b/iu.test(normalizeSqlSummary(statement));
      return [
        {
          kind: "function",
          summary: `${verb.toUpperCase().replace(/\s+/gu, " ")} ${type.toUpperCase()} ${unquote(name)}${args}`,
          drops: verb.toUpperCase() === "DROP",
          securityDefiner,
          access: securityDefiner,
        },
      ];
    },
  },
  {
    pattern: /^(CREATE|ALTER|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?([^\s]+)\s+ON\s+([^\s(]+)/iu,
    classify: ([, verb = "", name, table]) => [
      {
        kind: "policy",
        summary: `${verb.toUpperCase()} POLICY ${unquote(name)} ON ${unquote(table)}`,
        table: unquote(table),
        access: true,
      },
    ],
  },
  {
    pattern:
      /^(CREATE|DROP)\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?([^\s]+)(?:[\s\S]*?\bON\s+([^\s(]+))?/iu,
    classify: ([, verb = "", name, table]) => [
      {
        kind: "trigger",
        summary: `${verb.toUpperCase()} TRIGGER ${unquote(name)}${table ? ` ON ${unquote(table)}` : ""}`,
        table: table ? unquote(table) : undefined,
        drops: verb.toUpperCase() === "DROP",
      },
    ],
  },
  {
    pattern: /^(?:GRANT|REVOKE)\b/iu,
    classify: (_match, statement) => [
      { kind: "grant", summary: normalizeSqlSummary(statement), access: true },
    ],
  },
  {
    pattern: /^DO\b/iu,
    classify: (_match, statement) => [summarizeDoBlock(statement)],
  },
];

/** Classifies one statement into the changes it makes; anything unrecognized is still listed. */
const classifySqlStatement = (statement: string, action: "added" | "removed"): SqlDdlChange[] => {
  const flat = normalizeSqlSummary(statement);
  const match = DDL_MATCHERS.map(({ pattern, classify }) => ({
    found: pattern.exec(flat),
    classify,
  })).find(({ found }) => found);
  // Anything else, such as a type, an extension, or a data backfill, is still a change to see.
  const classified = match?.found
    ? match.classify(match.found, statement)
    : [{ kind: "other" as const, summary: clip(flat, MAX_OTHER_SUMMARY) }];
  const access = ACCESS_STATEMENT.test(flat);
  return classified.map(({ drops, access: ownAccess, securityDefiner, ...change }) => ({
    action,
    ...change,
    securityDefiner: securityDefiner ?? false,
    ...(drops ? { drops } : {}),
    // An access statement nobody parses is shown whole, so its effect is never cut off.
    ...(ownAccess || access
      ? { access: true, summary: access && change.kind === "other" ? flat : change.summary }
      : {}),
  }));
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
      changes.push(...classifySqlStatement(statement, action));
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

const GRANT_PATTERN =
  /^(GRANT|REVOKE)\s+(GRANT\s+OPTION\s+FOR\s+)?([\s\S]+?)\s+ON\s+([\s\S]+?)\s+(?:TO|FROM)\s+([\s\S]+?)(\s+WITH\s+GRANT\s+OPTION)?(?:\s+GRANTED\s+BY\s+\S+)?(?:\s+CASCADE|\s+RESTRICT)?$/iu;

const OBJECT_TYPE =
  /^(FUNCTION|PROCEDURE|ROUTINE|SEQUENCE|SCHEMA|TABLE|TYPE|DOMAIN|DATABASE|ALL\s+\w+\s+IN\s+SCHEMA)\s+/iu;

/** One privilege, on one object or column, for one role, as `GRANT` or `REVOKE` states it. */
type GrantFact = {
  verb: "GRANT" | "REVOKE";
  option: boolean;
  privilege: string;
  column: string;
  type: string;
  object: string;
  role: string;
};

/** Spells a signature or column list one way, so `f(uuid,text)` and `f(uuid, text)` match. */
const tidy = (text: string) =>
  unquote(text)
    .replace(/\s*\(\s*/gu, "(")
    .replace(/\s*\)/gu, ")")
    .replace(/\s*,\s*/gu, ", ");

/** Splits `UPDATE (id, name)` into one privilege per column, so a grant gaining a column shows it. */
const privilegeColumns = (privilege: string): Array<{ privilege: string; column: string }> => {
  const match = /^([A-Za-z ]+?)\s*\(([\s\S]*)\)$/u.exec(privilege.trim());
  const keyword = (match?.[1] ?? privilege).trim().toUpperCase().replace(/\s+/gu, " ");
  const name = keyword === "ALL PRIVILEGES" ? "ALL" : keyword;
  return match
    ? splitTopLevel(match[2] ?? "").map((column) => ({ privilege: name, column: unquote(column) }))
    : [{ privilege: name, column: "" }];
};

const grantFacts = (sql: string): GrantFact[] =>
  splitSqlStatements(sql).flatMap((statement) => {
    const match = GRANT_PATTERN.exec(normalizeSqlSummary(statement));
    if (!match) {
      return [];
    }
    const [, verb = "", revokeOption, privileges = "", objects = "", roles = "", grantOption] =
      match;
    const type = OBJECT_TYPE.exec(objects)?.[1]?.toUpperCase().replace(/\s+/gu, " ") ?? "";
    const names = splitTopLevel(type ? objects.replace(OBJECT_TYPE, "") : objects);
    return splitTopLevel(privileges)
      .flatMap(privilegeColumns)
      .flatMap(({ privilege, column }) =>
        names.flatMap((object) =>
          splitTopLevel(roles).map((role) => ({
            verb: verb.toUpperCase() === "GRANT" ? ("GRANT" as const) : ("REVOKE" as const),
            option: Boolean(revokeOption ?? grantOption),
            privilege,
            column,
            type: type === "TABLE" ? "" : type,
            object: tidy(object),
            role: unquote(role),
          })),
        ),
      );
  });

const factKey = (fact: GrantFact) =>
  [fact.verb, fact.option, fact.privilege, fact.column, fact.type, fact.object, fact.role].join(
    "\u0000",
  );

type Action = "added" | "removed";

/** Groups items by a key, keeping first-seen order. */
const groupBy = <T>(items: readonly T[], key: (item: T) => string): T[][] => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  }
  return [...groups.values()];
};

/**
 * Lists the grants and revocations that changed, regrouped into statements. A long `GRANT`
 * that gains one table or column reads as that one table or column, not the whole statement twice.
 */
export const extractGrantDelta = (
  baseSql: string,
  headSql: string,
): Array<{ action: Action; statement: string }> => {
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

  const statementOf = ({ action, fact }: { action: Action; fact: GrantFact }) =>
    [action, fact.verb, fact.option, fact.type, fact.role].join("\u0000");

  return groupBy(changed, statementOf).flatMap((statement) => {
    // Each object's privileges, with column privileges rejoined: `UPDATE (id, email)`.
    const objects = groupBy(statement, ({ fact }) => fact.object).map((entries) => ({
      object: entries[0]?.fact.object ?? "",
      privileges: groupBy(entries, ({ fact }) => fact.privilege)
        .map((same) => {
          const columns = same.map(({ fact }) => fact.column).filter(Boolean);
          const privilege = same[0]?.fact.privilege ?? "";
          return columns.length > 0 ? `${privilege} (${columns.join(", ")})` : privilege;
        })
        .join(", "),
    }));
    const first = statement[0];
    if (!first) {
      return [];
    }
    const { action, fact } = first;
    return groupBy(objects, ({ privileges }) => privileges).map((same) => {
      const optionFor = fact.verb === "REVOKE" && fact.option ? "GRANT OPTION FOR " : "";
      const withOption = fact.verb === "GRANT" && fact.option ? " WITH GRANT OPTION" : "";
      const target = `${fact.type ? `${fact.type} ` : ""}${same.map(({ object }) => object).join(", ")}`;
      const direction = fact.verb === "GRANT" ? "TO" : "FROM";
      return {
        action,
        statement: `${fact.verb} ${optionFor}${same[0]?.privileges} ON ${target} ${direction} ${fact.role}${withOption}`,
      };
    });
  });
};

type Mark = "+" | "-" | "~";

/** A change as the packet shows it: `mark` for the statement, `effect` for what it does. */
type Marked = SqlDdlChange & {
  mark: Mark;
  effect: Mark;
  previous?: SqlDdlChange;
  /** Set when a function changed in place and gained or lost `SECURITY DEFINER`. */
  definerChange?: "added" | "removed";
};

/**
 * Pairs an added and a removed statement with the same summary into one changed (`~`) entry,
 * and gives each change its effect: an added `DROP` removes, a removed `DROP` restores.
 */
const markChanges = (changes: readonly SqlDdlChange[]): Marked[] => {
  const removed = changes.filter((change) => change.action === "removed");
  const paired = new Set<SqlDdlChange>();

  const effectOf = (change: SqlDdlChange): Mark =>
    (change.action === "added") !== Boolean(change.drops) ? "+" : "-";

  const marked: Marked[] = [];
  for (const change of changes.filter((entry) => entry.action === "added")) {
    const twin = removed.find(
      (other) =>
        !paired.has(other) && other.kind === change.kind && other.summary === change.summary,
    );
    if (!twin) {
      marked.push({ ...change, mark: "+", effect: effectOf(change) });
      continue;
    }
    paired.add(twin);
    marked.push({
      ...change,
      mark: "~",
      effect: "~",
      previous: twin,
      securityDefiner: change.securityDefiner || twin.securityDefiner,
      access: change.access || twin.access,
      ...(change.securityDefiner === twin.securityDefiner
        ? {}
        : { definerChange: change.securityDefiner ? ("added" as const) : ("removed" as const) }),
    });
  }
  for (const change of removed.filter((entry) => !paired.has(entry))) {
    marked.push({ ...change, mark: "-", effect: effectOf(change) });
  }
  return marked;
};

const TABLE_PART_LABELS: ReadonlyArray<readonly [string, string, string]> = [
  ["column", "column", "columns"],
  ["constraint", "constraint", "constraints"],
  ["index", "index", "indexes"],
  ["trigger", "trigger", "triggers"],
  ["alteration", "other change", "other changes"],
];

const MAX_TABLE_LINES = 12;
const MAX_LISTED = 12;

/** How the items of a `CREATE TABLE` changed in place: each column or constraint added, removed, or changed. */
const tableItemEffects = (change: Marked): Array<{ kind: string; effect: Mark }> => {
  if (change.effect !== "~" || !change.previous) {
    return [];
  }

  const index = (parts: readonly string[] = []) =>
    new Map(
      parts.map((part) => {
        const [kind = "", name = "", text = ""] = part.split("\u0000");
        return [`${kind}\u0000${name}`, { kind, text }] as const;
      }),
    );

  const before = index(change.previous.parts);
  const after = index(change.parts);
  return [
    ...[...after].flatMap(([key, { kind, text }]) =>
      before.get(key)?.text === text
        ? []
        : [{ kind, effect: before.has(key) ? ("~" as const) : ("+" as const) }],
    ),
    ...[...before].flatMap(([key, { kind }]) =>
      after.has(key) ? [] : [{ kind, effect: "-" as const }],
    ),
  ];
};

/** One line for a table, ranked so dropped tables come first, then new ones, then the rest. */
const describeTable = (
  table: string,
  changes: readonly Marked[],
): { line: string; rank: number } => {
  const own = changes.find((change) => change.kind === "table");
  const items = own ? tableItemEffects(own) : [];
  const effects = [
    ...changes
      .filter((change) => change.kind !== "table")
      .map(({ kind, effect }) => ({ kind, effect })),
    ...items,
  ];
  const state =
    own?.effect === "+"
      ? "new"
      : own?.effect === "-"
        ? "**dropped**"
        : own && items.length === 0
          ? "definition changed"
          : "";
  const parts = TABLE_PART_LABELS.flatMap(([kind, one, many]) =>
    (["+", "-", "~"] as const).flatMap((effect) => {
      const count = effects.filter(
        (entry) => entry.kind === kind && entry.effect === effect,
      ).length;
      return count > 0 ? [`${effect}${count} ${count === 1 ? one : many}`] : [];
    }),
  );
  // A dropped table takes its parts with it; listing them adds nothing.
  const detail = own?.effect === "-" ? [] : parts;
  return {
    line: `\`${table}\`: ${[state, detail.join(", ")].filter(Boolean).join("; ")}`,
    rank: own?.effect === "-" ? 0 : own?.effect === "+" ? 1 : 2,
  };
};

const definerNote = (change: Marked) =>
  change.definerChange
    ? ` **[SECURITY DEFINER ${change.definerChange}]**`
    : change.securityDefiner
      ? " **[SECURITY DEFINER]**"
      : "";

/** Describes an access change; a changed `DO` block says which of its literals changed. */
const describeAccess = (change: Marked): string => {
  const code = (text: string) => `\`${text}\``;

  const previous = change.previous;
  if (change.kind === "dynamic") {
    const before = new Set(previous?.parts ?? []);
    const after = new Set(change.parts ?? []);
    const adds = [...after].filter((part) => !before.has(part));
    const removes = [...before].filter((part) => !after.has(part));
    const delta = [
      adds.length > 0 ? `adds ${adds.map((part) => code(`'${part}'`)).join(", ")}` : "",
      removes.length > 0 ? `removes ${removes.map((part) => code(`'${part}'`)).join(", ")}` : "",
    ].filter(Boolean);
    const changed = previous ? `; ${delta.length > 0 ? delta.join("; ") : "its code changed"}` : "";
    return `${code(change.mark)} ${change.summary.replace(/^DO block/u, "`DO` block")}${changed}`;
  }
  return `${code(change.mark)} ${code(change.summary)}${definerNote(change)}`;
};

/** Whether a `GRANT` or `REVOKE` statement breaks down into facts the grant delta compares. */
const isComparedGrant = (summary: string) => grantFacts(summary).length > 0;

/**
 * Renders the schema delta as packet bullets. Access changes are listed in full and never
 * capped: row-level security, policies, roles, views, ownership, default privileges,
 * security-definer functions, grants, and `DO` blocks. Tables get one line each, and
 * other functions and statements a list.
 */
export const renderSchemaDelta = ({
  baseSql,
  headSql,
}: {
  baseSql: string;
  headSql: string;
}): string[] => {
  // Grants that break down into facts are compared per privilege below; others stay whole.
  const changes = markChanges(
    extractSqlDdlDelta(baseSql, headSql).filter(
      (change) => change.kind !== "grant" || !isComparedGrant(change.summary),
    ),
  );

  const code = (mark: string, text: string) => `\`${mark}\` \`${text}\``;

  const access = [
    ...changes.filter((change) => change.access).map(describeAccess),
    ...extractGrantDelta(baseSql, headSql).map(({ action, statement }) =>
      code(action === "added" ? "+" : "-", statement),
    ),
  ];

  const tables = groupBy(
    changes.filter((change) => change.table && !change.access),
    (change) => change.table ?? "",
  )
    .map((tableChanges) => describeTable(tableChanges[0]?.table ?? "", tableChanges))
    .sort((a, b) => a.rank - b.rank || a.line.localeCompare(b.line))
    .map(({ line }) => line);

  const functions = changes
    .filter((change) => change.kind === "function" && !change.access)
    .map((change) =>
      code(
        change.mark,
        change.summary.replace(/^\S+(?:\s+OR\s+REPLACE)?\s+(?:FUNCTION|PROCEDURE)\s+/u, ""),
      ),
    );

  const capped = (items: readonly string[], noun: string) =>
    items.length > MAX_LISTED
      ? [...items.slice(0, MAX_LISTED), `_+${items.length - MAX_LISTED} more ${noun}_`]
      : [...items];

  // Statements no pattern recognizes are few and easy to miss, so all of them are listed.
  const others = changes
    .filter((change) => !change.access && !change.table && change.kind !== "function")
    .map((change) => code(change.mark, change.summary));

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
    lines.push("- **Other statements:**", ...others.map((line) => `  - ${line}`));
  }
  if (lines.some((line) => line.includes("`~`"))) {
    lines.push("- _`~` marks a statement changed in place._");
  }
  return lines.length > 0 ? lines : ["- No net SQL DDL changes detected."];
};
