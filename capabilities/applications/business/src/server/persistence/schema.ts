import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { appUsers } from "@merit/auth/schema";
import { contacts } from "@merit/contacts/schema";
import { organizations } from "@merit/organizations/schema";
import { fundingRounds } from "@merit/rounds/schema";

const recordedAt = () => timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow();

const publicId = () =>
  text("id")
    .primaryKey()
    .default(sql`merit_public_id()`);

export const applicationCases = pgTable(
  "application_cases",
  {
    id: publicId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    roundId: text("round_id"),
    position: integer().notNull().default(0),
    materialVersion: integer("material_version"),
    revision: integer().notNull().default(0),
    contactId: uuid("contact_id"),
    intakeStatus: text("intake_status", { enum: ["in_preparation", "ready"] }).notNull(),
    withdrawal: jsonb(),
    summary: text().notNull().default(""),
    summaryAuthor: jsonb("summary_author"),
    attention: jsonb().notNull().default([]),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.roundId],
      foreignColumns: [fundingRounds.organizationId, fundingRounds.id],
    }),
    unique("application_cases_owner_key").on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    unique("application_cases_round_position_key").on(t.organizationId, t.roundId, t.position),
    check("application_cases_revisions_check", sql`${t.revision} >= 0`),
    check("application_cases_status_check", sql`${t.intakeStatus} IN ('in_preparation', 'ready')`),
  ],
);
export const materialVersions = pgTable(
  "material_versions",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => applicationCases.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    content: jsonb().notNull(),
    changeKind: text("change_kind").notNull(),
    source: jsonb().notNull(),
    reason: text(),
    recordedByUserId: text("recorded_by_user_id").references(() => appUsers.id),
    recordedAt: recordedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.version] }),
    check("material_version_positive", sql`${t.version} > 0`),
  ],
);
export const materialDrafts = pgTable(
  "material_drafts",
  {
    caseId: text("case_id")
      .primaryKey()
      .references(() => applicationCases.id, { onDelete: "cascade" }),
    baseMaterialVersion: integer("base_material_version").notNull(),
    kind: text({ enum: ["correction", "revision"] }).notNull(),
    content: jsonb().notNull(),
    reason: text().notNull(),
    revision: integer().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.caseId, t.baseMaterialVersion],
      foreignColumns: [materialVersions.caseId, materialVersions.version],
    }),
  ],
);

// Receipts survive deletion so a lost creation response cannot create a second case.
export const applicationCreationReceipts = pgTable(
  "application_creation_receipts",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    requestId: uuid("request_id").notNull(),
    publicId: text("case_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.requestId] })],
);
