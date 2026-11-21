import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { appUsers } from "@merit/auth/schema";
import {
  moneyMinorUnits,
  nonBlankCheck,
  nonNegativeCheck,
  optimisticRevision,
  positiveCheck,
  publicId,
  recordedAt,
} from "@merit/db/schema";
import { organizations } from "@merit/organizations/schema";

export const fundingRounds = pgTable(
  "funding_rounds",
  {
    id: publicId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    revision: optimisticRevision(),
    managerUserId: text("manager_user_id").references(() => appUsers.id),
    managerName: text("manager_name").notNull(),
    title: text().notNull(),
    purpose: text().notNull(),
    currency: text().notNull().default("EUR"),
    budgetEstablished: boolean("budget_established").notNull().default(false),
    budgetMinorUnits: moneyMinorUnits("budget_minor_units"),
    meetingDate: date("meeting_date"),
    snapshotDate: date("snapshot_date").notNull(),
    decisionStatus: text("decision_status").notNull(),
    criteriaVersion: integer("criteria_version").notNull().default(1),
  },
  (t) => [
    unique("funding_rounds_owner_key").on(t.organizationId, t.id),
    index("funding_rounds_manager_user_idx").on(t.managerUserId),
    index("funding_rounds_criteria_version_idx").on(t.id, t.criteriaVersion),
    nonNegativeCheck("funding_rounds_revision_check", t.revision),
    check("funding_rounds_currency_check", sql`${t.currency} = 'EUR'`),
    nonNegativeCheck("funding_rounds_budget_check", t.budgetMinorUnits),
    nonBlankCheck("funding_rounds_decision_status_check", t.decisionStatus),
    positiveCheck("funding_rounds_criteria_version_check", t.criteriaVersion),
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
    positiveCheck("criteria_version_positive", t.version),
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
    nonNegativeCheck("criteria_version_items_position_check", t.position),
    nonBlankCheck("criteria_version_items_title_check", t.title),
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
