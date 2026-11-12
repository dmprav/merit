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

import { applicationCases, materialVersions } from "@merit/applications/schema";
import { appUsers } from "@merit/auth/schema";
import { contacts } from "@merit/contacts/schema";
import { fundingRounds, criteriaVersions } from "@merit/rounds/schema";

const recordedAt = () => timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow();

export const reviewRequests = pgTable(
  "review_requests",
  {
    organizationId: text("organization_id").notNull(),
    caseId: text("case_id")
      .notNull()
      .references(() => applicationCases.id, { onDelete: "cascade" }),
    id: text().notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    reviewer: text().notNull(),
    applicationVersion: integer("material_version"),
    criteriaRoundPublicId: text("criteria_round_id"),
    criteriaVersion: integer("criteria_version"),
    status: text({ enum: ["outstanding", "received", "cancelled"] }).notNull(),
    recorder: jsonb(),
    closedBy: jsonb("closed_by"),
    position: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.id] }),
    foreignKey({
      columns: [t.organizationId, t.criteriaRoundPublicId],
      foreignColumns: [fundingRounds.organizationId, fundingRounds.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.caseId],
      foreignColumns: [applicationCases.organizationId, applicationCases.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    foreignKey({
      columns: [t.caseId, t.applicationVersion],
      foreignColumns: [materialVersions.caseId, materialVersions.version],
    }),
    foreignKey({
      columns: [t.criteriaRoundPublicId, t.criteriaVersion],
      foreignColumns: [criteriaVersions.roundPublicId, criteriaVersions.version],
    }),
  ],
);
export const assessments = pgTable(
  "assessments",
  {
    organizationId: text("organization_id").notNull(),
    caseId: text("case_id")
      .notNull()
      .references(() => applicationCases.id, { onDelete: "cascade" }),
    id: text().notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    reviewer: text().notNull(),
    requestId: text("request_id"),
    previousId: text("previous_id"),
    authorUserId: text("author_user_id").references(() => appUsers.id),
    position: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.id] }),
    foreignKey({
      columns: [t.organizationId, t.caseId],
      foreignColumns: [applicationCases.organizationId, applicationCases.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    unique("assessments_request_key").on(t.caseId, t.requestId),
    foreignKey({
      columns: [t.caseId, t.requestId],
      foreignColumns: [reviewRequests.caseId, reviewRequests.id],
    }),
  ],
);
export const assessmentVersions = pgTable(
  "assessment_versions",
  {
    organizationId: text("organization_id").notNull(),
    caseId: text("case_id").notNull(),
    assessmentId: text("assessment_id").notNull(),
    version: integer().notNull(),
    applicationVersion: integer("material_version"),
    criteriaRoundPublicId: text("criteria_round_id"),
    criteriaVersion: integer("criteria_version"),
    content: jsonb().notNull(),
    recorder: jsonb(),
    note: text().notNull(),
    recordedAt: recordedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.assessmentId, t.version] }),
    foreignKey({
      columns: [t.organizationId, t.caseId],
      foreignColumns: [applicationCases.organizationId, applicationCases.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.criteriaRoundPublicId],
      foreignColumns: [fundingRounds.organizationId, fundingRounds.id],
    }),
    foreignKey({
      columns: [t.caseId, t.assessmentId],
      foreignColumns: [assessments.caseId, assessments.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.caseId, t.applicationVersion],
      foreignColumns: [materialVersions.caseId, materialVersions.version],
    }),
    foreignKey({
      columns: [t.criteriaRoundPublicId, t.criteriaVersion],
      foreignColumns: [criteriaVersions.roundPublicId, criteriaVersions.version],
    }),
  ],
);

export const reviewStates = pgTable(
  "review_states",
  {
    caseId: text("case_id")
      .primaryKey()
      .references(() => applicationCases.id, { onDelete: "cascade" }),
    revision: integer().notNull().default(0),
  },
  (t) => [check("review_states_revision_check", sql`${t.revision} >= 0`)],
);
