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
