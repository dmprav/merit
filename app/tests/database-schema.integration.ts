import { expect } from "vite-plus/test";

import { databaseTest as it } from "@merit/test-support/database";

it("defines a primary key on every public table and avoids mutable email primary keys", async ({
  database,
}) => {
  const missingPrimaryKey = await database.client.query<{ table_name: string }>(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        WHERE con.conrelid = c.oid AND con.contype = 'p'
      )
    ORDER BY c.relname
  `);
  const emailPrimaryKeys = await database.client.query<{ table_name: string }>(`
    SELECT c.relname AS table_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
    WHERE n.nspname = 'public'
      AND con.contype = 'p'
      AND a.attname = 'email'
    ORDER BY c.relname
  `);

  expect(missingPrimaryKey.rows).toEqual([]);
  expect(emailPrimaryKeys.rows).toEqual([]);
});

it("indexes every foreign key with a leading non-partial index and avoids duplicate parent FKs", async ({
  database,
}) => {
  const unindexedForeignKeys = await database.client.query<{
    table_name: string;
    constraint_name: string;
    columns: string[];
  }>(`
    SELECT
      c.relname AS table_name,
      con.conname AS constraint_name,
      array_agg(a.attname ORDER BY ord.n) AS columns
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ord(attnum, n) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ord.attnum
    WHERE n.nspname = 'public'
      AND con.contype = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index idx
        WHERE idx.indrelid = con.conrelid
          AND idx.indisvalid
          AND idx.indisready
          AND idx.indpred IS NULL
          AND idx.indnkeyatts >= array_length(con.conkey, 1)
          AND (string_to_array(idx.indkey::text, ' ')::int2[])[1:array_length(con.conkey, 1)] = con.conkey
      )
    GROUP BY c.relname, con.conname
    ORDER BY c.relname, con.conname
  `);

  const duplicateParentForeignKeys = await database.client.query<{
    table_name: string;
    target_table: string;
    narrow_fk: string;
    wide_fk: string;
  }>(`
    SELECT
      c.relname AS table_name,
      t.relname AS target_table,
      narrow.conname AS narrow_fk,
      wide.conname AS wide_fk
    FROM pg_constraint narrow
    JOIN pg_constraint wide
      ON wide.conrelid = narrow.conrelid
     AND wide.confrelid = narrow.confrelid
     AND wide.oid <> narrow.oid
     AND array_length(narrow.conkey, 1) < array_length(wide.conkey, 1)
     AND NOT EXISTS (
       SELECT 1
       FROM unnest(narrow.conkey, narrow.confkey) AS np(child_col, parent_col)
       WHERE NOT EXISTS (
         SELECT 1
         FROM unnest(wide.conkey, wide.confkey) AS wp(child_col, parent_col)
         WHERE wp.child_col = np.child_col
           AND wp.parent_col = np.parent_col
       )
     )
     AND (
       wide.confmatchtype = 'f'
       OR NOT EXISTS (
         SELECT 1
         FROM unnest(wide.conkey, wide.confkey) AS wp(child_col, parent_col)
         JOIN pg_attribute a
           ON a.attrelid = wide.conrelid
          AND a.attnum = wp.child_col
          AND NOT a.attisdropped
         WHERE NOT EXISTS (
           SELECT 1
           FROM unnest(narrow.conkey, narrow.confkey) AS np(child_col, parent_col)
           WHERE np.child_col = wp.child_col
             AND np.parent_col = wp.parent_col
         )
           AND NOT a.attnotnull
       )
     )
    JOIN pg_class c ON c.oid = narrow.conrelid
    JOIN pg_class t ON t.oid = narrow.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND narrow.contype = 'f'
      AND wide.contype = 'f'
    ORDER BY c.relname, narrow.conname
  `);

  expect(unindexedForeignKeys.rows).toEqual([]);
  expect(duplicateParentForeignKeys.rows).toEqual([]);
});

it("enforces SQL CHECK constraints on status, kind, role, and delivery columns", async ({
  database,
}) => {
  const uncheckedColumns = await database.client.query<{
    table_name: string;
    column_name: string;
  }>(`
    SELECT c.relname AS table_name, a.attname AS column_name
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND t.typname = 'text'
      AND (
        a.attname ~ '^(status|kind|role|administration|delivery|intake_status|change_kind|decision_status)$'
        OR (c.relname = 'organization_invitations' AND a.attname = 'purpose')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        WHERE con.conrelid = c.oid
          AND con.contype = 'c'
          AND a.attnum = ANY(con.conkey)
      )
    ORDER BY c.relname, a.attname
  `);

  expect(uncheckedColumns.rows).toEqual([]);
});

it("stores committed money as constrained numeric(30,0) minor units and checks currency columns", async ({
  database,
}) => {
  const invalidMoneyColumns = await database.client.query<{
    table_name: string;
    column_name: string;
    column_type: string;
    has_check: boolean;
  }>(`
    SELECT
      c.relname AS table_name,
      a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS column_type,
      EXISTS (
        SELECT 1
        FROM pg_constraint con
        WHERE con.conrelid = c.oid
          AND con.contype = 'c'
          AND a.attnum = ANY(con.conkey)
      ) AS has_check
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND (
        (
          a.attname ~ '_minor_units$'
          AND (
            format_type(a.atttypid, a.atttypmod) <> 'numeric(30,0)'
            OR NOT EXISTS (
              SELECT 1
              FROM pg_constraint con
              WHERE con.conrelid = c.oid
                AND con.contype = 'c'
                AND a.attnum = ANY(con.conkey)
            )
          )
        )
        OR (
          a.attname ~ '(^|_)(amount|budget|allocation|grant_amount|eur|cents)(_|$)'
          AND format_type(a.atttypid, a.atttypmod) IN ('real', 'double precision')
        )
      )
    ORDER BY c.relname, a.attname
  `);

  const uncheckedCurrencyColumns = await database.client.query<{
    table_name: string;
    column_name: string;
  }>(`
    SELECT c.relname AS table_name, a.attname AS column_name
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname ~ '(^|_)currency$'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        WHERE con.conrelid = c.oid
          AND con.contype = 'c'
          AND a.attnum = ANY(con.conkey)
      )
    ORDER BY c.relname, a.attname
  `);

  expect(invalidMoneyColumns.rows).toEqual([]);
  expect(uncheckedCurrencyColumns.rows).toEqual([]);
});

it("enables row-level security with at least one policy on every tenant-scoped table", async ({
  database,
}) => {
  const unprotectedTables = await database.client.query<{
    table_name: string;
    rls_enabled: boolean;
    policy_count: number;
  }>(`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      (SELECT count(*)::int FROM pg_policy pol WHERE pol.polrelid = c.oid) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND (
        c.relname = 'organizations'
        OR EXISTS (
          SELECT 1
          FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND a.attnum > 0
            AND NOT a.attisdropped
            AND a.attname = 'organization_id'
        )
      )
      AND (
        NOT c.relrowsecurity
        OR NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)
      )
    ORDER BY c.relname
  `);

  expect(unprotectedTables.rows).toEqual([]);
});

// RLS policies evaluate these two scope helpers directly under the calling role;
// every other SECURITY DEFINER function must revoke PUBLIC execute explicitly.
const PUBLIC_RLS_SCOPE_HELPERS = new Set(["merit_onboarding_ids()", "merit_workspace_ids()"]);

it("pins search_path and revokes PUBLIC execute on every SECURITY DEFINER function", async ({
  database,
}) => {
  const definerFunctions = await database.client.query<{
    function_name: string;
    has_search_path: boolean;
    public_executable: boolean;
  }>(`
    SELECT
      p.oid::regprocedure::text AS function_name,
      EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      ) AS has_search_path,
      has_function_privilege('public', p.oid, 'EXECUTE') AS public_executable
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
    ORDER BY function_name
  `);

  const unsafeFunctions = definerFunctions.rows.filter(
    (fn) =>
      !fn.has_search_path ||
      (fn.public_executable && !PUBLIC_RLS_SCOPE_HELPERS.has(fn.function_name)),
  );

  expect(definerFunctions.rows.length).toBeGreaterThan(0);
  expect(unsafeFunctions).toEqual([]);
});

// `memberships.version` is a 0-based optimistic revision counter; all other `version`
// and `format_version` columns are 1-based version numbers (`> 0`).
const ZERO_BASED_VERSION_TABLES = new Set(["memberships"]);

const stripOuterParens = (expr: string): string => {
  let current = expr.trim();
  while (current.startsWith("(") && current.endsWith(")")) {
    let depth = 0;
    let wrapsWhole = true;
    for (let i = 0; i < current.length; i += 1) {
      const ch = current[i];
      if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
        if (depth === 0 && i < current.length - 1) {
          wrapsWhole = false;
          break;
        }
      }
    }
    if (!wrapsWhole) {
      break;
    }
    current = current.slice(1, -1).trim();
  }
  return current;
};

const splitTopLevelAnd = (expr: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    } else if (depth === 0 && /^\s+AND\s+/iu.test(expr.slice(i))) {
      parts.push(expr.slice(start, i).trim());
      const match = /^\s+AND\s+/iu.exec(expr.slice(i));
      i += (match?.[0].length ?? 1) - 1;
      start = i + 1;
    }
  }
  parts.push(expr.slice(start).trim());
  return parts;
};

const satisfiesLowerBound = (column: string, checkDef: string, requiresPositive: boolean) => {
  const withoutPrefix = checkDef.replace(/^CHECK\s*/iu, "").trim();
  const body = stripOuterParens(withoutPrefix);
  const quotedCol = `"?${column}"?`;
  const boundPattern = requiresPositive
    ? new RegExp(`^${quotedCol}\\s*>\\s*0$`, "iu")
    : new RegExp(`^${quotedCol}\\s*(?:>=\\s*0|>\\s*0)$`, "iu");
  return splitTopLevelAnd(body).some((conjunct) => boundPattern.test(stripOuterParens(conjunct)));
};

it("enforces bounds on integer version/revision/position columns and keeps audit_events immutable", async ({
  database,
}) => {
  // Regression check: an OR clause cannot satisfy a lower bound.
  expect(satisfiesLowerBound("version", "CHECK (((version > 0) OR (version = 0)))", true)).toBe(
    false,
  );
  expect(satisfiesLowerBound("version", "CHECK (((version > 0) AND (version < 100)))", true)).toBe(
    true,
  );

  const counterColumns = await database.client.query<{
    table_name: string;
    column_name: string;
    checks: Array<{ column: string; def: string }>;
  }>(`
    SELECT
      c.relname AS table_name,
      a.attname AS column_name,
      coalesce(
        (
          SELECT jsonb_agg(entry)
          FROM (
            SELECT jsonb_build_object('column', a.attname, 'def', pg_get_constraintdef(con.oid)) AS entry
            FROM pg_constraint con
            WHERE con.conrelid = c.oid
              AND con.contype = 'c'
              AND a.attnum = ANY(con.conkey)
            UNION ALL
            SELECT jsonb_build_object('column', pa.attname, 'def', pg_get_constraintdef(parent_check.oid)) AS entry
            FROM pg_constraint fk
            JOIN LATERAL unnest(fk.conkey, fk.confkey) AS cols(child_attnum, parent_attnum)
              ON cols.child_attnum = a.attnum
            JOIN pg_attribute pa
              ON pa.attrelid = fk.confrelid
             AND pa.attnum = cols.parent_attnum
             AND NOT pa.attisdropped
            JOIN pg_constraint parent_check
              ON parent_check.conrelid = fk.confrelid
             AND parent_check.contype = 'c'
             AND cols.parent_attnum = ANY(parent_check.conkey)
            WHERE fk.conrelid = c.oid
              AND fk.contype = 'f'
          ) entries
        ),
        '[]'::jsonb
      ) AS checks
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attnotnull
      AND t.typname IN ('int2', 'int4', 'int8')
      AND a.attname IN ('revision', 'version', 'position', 'format_version')
    ORDER BY c.relname, a.attname
  `);

  const uncheckedCounterColumns = counterColumns.rows.filter((row) => {
    const requiresPositive =
      row.column_name === "format_version" ||
      (row.column_name === "version" && !ZERO_BASED_VERSION_TABLES.has(row.table_name));
    return !row.checks.some((check) =>
      satisfiesLowerBound(check.column, check.def, requiresPositive),
    );
  });

  const auditImmutabilityTriggers = await database.client.query<{ trigger_name: string }>(`
    SELECT tg.tgname AS trigger_name
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'audit_events'
      AND NOT tg.tgisinternal
      AND tg.tgenabled IN ('O', 'A')
      AND (tg.tgtype & 2) <> 0
      AND (tg.tgtype & 8) <> 0
      AND (tg.tgtype & 16) <> 0
    ORDER BY tg.tgname
  `);

  expect(counterColumns.rows.length).toBeGreaterThan(0);
  expect(uncheckedCounterColumns).toEqual([]);
  expect(auditImmutabilityTriggers.rows.length).toBeGreaterThan(0);
});
