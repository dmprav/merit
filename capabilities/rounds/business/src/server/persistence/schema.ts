import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { Provenance } from "@merit/auth";
import { appUsers } from "@merit/auth/schema";
import { organizations } from "@merit/organizations/schema";

const recordedAt = () => timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow();

const publicId = () =>
  text("id")
    .primaryKey()
    .default(sql`merit_public_id()`);

export const fundingRounds = pgTable(
  "funding_rounds",
  {
    id: publicId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    revision: integer().notNull().default(0),
    managerUserId: text("manager_user_id").references(() => appUsers.id),
    managerName: text("manager_name").notNull(),
    title: text().notNull(),
    purpose: text().notNull(),
    currency: text().notNull().default("EUR"),
    budget: numeric({ precision: 30, scale: 0 }),
    meetingDate: date("meeting_date"),
    snapshotDate: date("snapshot_date").notNull(),
    decisionStatus: text("decision_status").notNull(),
    criteriaVersion: integer("criteria_version").notNull().default(1),
  },
  (t) => [
    unique("funding_rounds_owner_key").on(t.organizationId, t.id),
    check("funding_rounds_revision_check", sql`${t.revision} >= 0`),
    check("funding_rounds_budget_check", sql`${t.budget} >= 0`),
  ],
);
export const criteriaVersions = pgTable(
  "criteria_versions",
  {
    roundPublicId: text("round_id")
      .notNull()
      .references(() => fundingRounds.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    criteria: jsonb().notNull(),
    recordedAt: recordedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.roundPublicId, t.version] }),
    check("criteria_version_positive", sql`${t.version} > 0`),
  ],
);
export const roundChanges = pgTable(
  "round_changes",
  {
    publicId: text("round_id").notNull(),
    revision: integer().notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => appUsers.id),
    provenance: jsonb().$type<Provenance>(),
    recordedAt: recordedAt(),
    action: text().notNull(),
    requestId: uuid("request_id"),
    reason: text(),
    before: jsonb(),
    after: jsonb(),
  },
  (t) => [
    primaryKey({ columns: [t.publicId, t.revision] }),
    unique("round_changes_creation_key").on(t.organizationId, t.requestId),
  ],
);
