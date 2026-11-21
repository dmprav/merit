import { sql, type AnyColumn } from "drizzle-orm";
import { check, integer, numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const publicId = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`merit_public_id()`);

export const uuidPk = (name = "id") => uuid(name).primaryKey().defaultRandom();

export const recordedAt = (name = "recorded_at") =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const optimisticRevision = (name = "revision") => integer(name).notNull().default(0);

export const moneyMinorUnits = (name: string) => numeric(name, { precision: 30, scale: 0 });

export const nonNegativeCheck = (name: string, column: AnyColumn) =>
  check(name, sql`${column} >= 0`);

export const positiveCheck = (name: string, column: AnyColumn) => check(name, sql`${column} > 0`);

export const nonBlankCheck = (name: string, column: AnyColumn) =>
  check(name, sql`length(btrim(${column})) > 0`);

export const enumCheck = (
  name: string,
  column: AnyColumn,
  values: readonly [string, ...string[]],
) =>
  check(
    name,
    sql`${column} IN (${sql.join(
      values.map((value) => sql.raw(`'${value.replaceAll("'", "''")}'`)),
      sql`, `,
    )})`,
  );
