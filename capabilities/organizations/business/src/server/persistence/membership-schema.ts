import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  integer,
  uniqueIndex,
  uuid,
  timestamp,
} from "drizzle-orm/pg-core";

import { appUsers } from "@merit/auth/schema";

export const organizations = pgTable(
  "organizations",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    slug: text().notNull().unique("organizations_slug_key"),
    kind: text({ enum: ["standard", "demo"] })
      .notNull()
      .default("standard"),
    demoExpiresAt: timestamp("demo_expires_at", { withTimezone: true }),
    demoSeedVersion: integer("demo_seed_version"),
  },
  (table) => [
    check(
      "organizations_demo_check",
      sql`(${table.kind} = 'standard' AND ${table.demoExpiresAt} IS NULL AND ${table.demoSeedVersion} IS NULL) OR (${table.kind} = 'demo' AND ${table.demoExpiresAt} IS NOT NULL AND ${table.demoSeedVersion} IS NOT NULL AND ${table.demoSeedVersion} > 0)`,
    ),
    check(
      "organizations_slug_check",
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(${table.slug}) <= 80 AND ${table.slug} NOT IN ('sign-in', 'organizations')`,
    ),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid().notNull().defaultRandom(),
    email: text(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    role: text({
      enum: ["member", "program_manager", "reviewer", "committee_reader"],
    }).notNull(),
    administration: text({ enum: ["none", "administrator", "owner"] })
      .notNull()
      .default("none"),
    version: integer().notNull().default(0),
  },
  (table) => [
    uniqueIndex("memberships_owner_key")
      .on(table.organizationId)
      .where(sql`${table.administration} = 'owner'`),
    check(
      "memberships_administration_check",
      sql`${table.administration} IN ('none', 'administrator', 'owner')`,
    ),
    primaryKey({ name: "memberships_pkey", columns: [table.organizationId, table.userId] }),
    foreignKey({
      name: "memberships_organization_id_fkey",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }),
    foreignKey({
      name: "memberships_user_id_fkey",
      columns: [table.userId],
      foreignColumns: [appUsers.id],
    }),
    index("memberships_user_id_idx").on(table.userId),
    check(
      "memberships_role_check",
      sql`${table.role} IN ('member', 'program_manager', 'reviewer', 'committee_reader')`,
    ),
  ],
);
