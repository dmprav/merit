import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  date,
  foreignKey,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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
    budgetEstablished: boolean("budget_established").notNull().default(false),
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
    recordedAt: recordedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.roundPublicId, t.version] }),
    check("criteria_version_positive", sql`${t.version} > 0`),
  ],
);
export const criteriaVersionItems = pgTable(
  "criteria_version_items",
  {
    roundPublicId: text("round_id").notNull(),
    version: integer().notNull(),
    position: integer().notNull(),
    id: uuid("criterion_id").notNull(),
    title: text().notNull(),
    description: text(),
  },
  (t) => [
    primaryKey({ columns: [t.roundPublicId, t.version, t.position] }),
    foreignKey({
      columns: [t.roundPublicId, t.version],
      foreignColumns: [criteriaVersions.roundPublicId, criteriaVersions.version],
    }).onDelete("cascade"),
    unique("criteria_version_items_criterion_key").on(t.roundPublicId, t.version, t.id),
    check("criteria_version_items_position_check", sql`${t.position} >= 0`),
    check("criteria_version_items_title_check", sql`length(btrim(${t.title})) > 0`),
  ],
);
export const roundCreationReceipts = pgTable(
  "round_creation_receipts",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    requestId: uuid("request_id").notNull(),
    publicId: text("round_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.requestId] })],
);
