import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  integer,
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
    caseId: text("case_id").notNull(),
    id: text().notNull(),
    contactId: uuid("contact_id").notNull(),
    reviewer: text().notNull(),
    applicationVersion: integer("material_version").notNull(),
    criteriaRoundPublicId: text("criteria_round_id").notNull(),
    criteriaVersion: integer("criteria_version").notNull(),
    status: text({ enum: ["outstanding", "received", "cancelled"] }).notNull(),
    recorderUserId: text("recorder_user_id"),
    recorderName: text("recorder_name"),
    recorderRecordedAt: timestamp("recorder_recorded_at", { withTimezone: true }),
    recorderProvenanceInterface: text("recorder_provenance_interface"),
    recorderProvenanceClientId: text("recorder_provenance_client_id"),
    closedByUserId: text("closed_by_user_id"),
    closedByName: text("closed_by_name"),
    closedByRecordedAt: timestamp("closed_by_recorded_at", { withTimezone: true }),
    closedByProvenanceInterface: text("closed_by_provenance_interface"),
    closedByProvenanceClientId: text("closed_by_provenance_client_id"),
    closedCause: text("closed_cause"),
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
    check(
      "review_requests_status_check",
      sql`${t.status} in ('outstanding', 'received', 'cancelled')`,
    ),
    check("review_requests_position_check", sql`${t.position} >= 0`),
    check(
      "review_requests_recorder_check",
      sql`((${t.recorderUserId} is null) = (${t.recorderName} is null)) and ((${t.recorderUserId} is null) = (${t.recorderRecordedAt} is null))`,
    ),
    check(
      "review_requests_recorder_provenance_check",
      sql`(${t.recorderProvenanceInterface} is null and ${t.recorderProvenanceClientId} is null) or (${t.recorderUserId} is not null and ((${t.recorderProvenanceInterface} = 'web' and ${t.recorderProvenanceClientId} is null) or (${t.recorderProvenanceInterface} = 'mcp' and ${t.recorderProvenanceClientId} is not null and length(btrim(${t.recorderProvenanceClientId})) > 0)))`,
    ),
    check(
      "review_requests_closed_by_check",
      sql`((${t.closedByUserId} is null) = (${t.closedByName} is null)) and ((${t.closedByUserId} is null) = (${t.closedByRecordedAt} is null))`,
    ),
    check(
      "review_requests_closed_by_provenance_check",
      sql`(${t.closedByProvenanceInterface} is null and ${t.closedByProvenanceClientId} is null) or (${t.closedByUserId} is not null and ((${t.closedByProvenanceInterface} = 'web' and ${t.closedByProvenanceClientId} is null) or (${t.closedByProvenanceInterface} = 'mcp' and ${t.closedByProvenanceClientId} is not null and length(btrim(${t.closedByProvenanceClientId})) > 0)))`,
    ),
    check(
      "review_requests_closed_cause_check",
      sql`${t.closedCause} is null or (${t.closedByUserId} is not null and ${t.closedCause} = 'application_withdrawn')`,
    ),
  ],
);

export const assessments = pgTable(
  "assessments",
  {
    organizationId: text("organization_id").notNull(),
    caseId: text("case_id").notNull(),
    id: text().notNull(),
    contactId: uuid("contact_id").notNull(),
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
    check("assessments_position_check", sql`${t.position} >= 0`),
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
    assessedOn: date("assessed_on"),
    position: text(),
    amount: text(),
    reasoning: text().notNull(),
    recorderUserId: text("recorder_user_id"),
    recorderName: text("recorder_name"),
    recorderRecordedAt: timestamp("recorder_recorded_at", { withTimezone: true }),
    recorderProvenanceInterface: text("recorder_provenance_interface"),
    recorderProvenanceClientId: text("recorder_provenance_client_id"),
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
    check("assessment_versions_version_check", sql`${t.version} >= 1`),
    check(
      "assessment_versions_criteria_pair_check",
      sql`(${t.criteriaRoundPublicId} is null) = (${t.criteriaVersion} is null)`,
    ),
    check(
      "assessment_versions_position_check",
      sql`${t.position} is null or ${t.position} in ('Fund', 'Fund with a condition', 'Defer', 'Decline')`,
    ),
    check(
      "assessment_versions_amount_check",
      sql`${t.amount} is null or (length(${t.amount}) <= 32 and ${t.amount} ~ '^\\d+(?:\\.\\d{1,2})?$')`,
    ),
    check(
      "assessment_versions_position_amount_check",
      sql`${t.position} is null or ${t.amount} is null or (${t.position} in ('Decline', 'Defer') and ${t.amount} ~ '^0+(?:\\.0{1,2})?$') or (${t.position} in ('Fund', 'Fund with a condition') and ${t.amount} !~ '^0+(?:\\.0{1,2})?$')`,
    ),
    check(
      "assessment_versions_reasoning_check",
      sql`length(btrim(${t.reasoning})) > 0 and length(${t.reasoning}) <= 20000`,
    ),
    check("assessment_versions_note_check", sql`length(${t.note}) <= 2000`),
    check(
      "assessment_versions_recorder_check",
      sql`((${t.recorderUserId} is null) = (${t.recorderName} is null)) and ((${t.recorderUserId} is null) = (${t.recorderRecordedAt} is null))`,
    ),
    check(
      "assessment_versions_recorder_provenance_check",
      sql`(${t.recorderProvenanceInterface} is null and ${t.recorderProvenanceClientId} is null) or (${t.recorderUserId} is not null and ((${t.recorderProvenanceInterface} = 'web' and ${t.recorderProvenanceClientId} is null) or (${t.recorderProvenanceInterface} = 'mcp' and ${t.recorderProvenanceClientId} is not null and length(btrim(${t.recorderProvenanceClientId})) > 0)))`,
    ),
  ],
);

export const assessmentVersionObservations = pgTable(
  "assessment_version_observations",
  {
    caseId: text("case_id").notNull(),
    assessmentId: text("assessment_id").notNull(),
    version: integer().notNull(),
    position: integer().notNull(),
    criterionId: uuid("criterion_id"),
    criterion: text().notNull(),
    text: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.assessmentId, t.version, t.position] }),
    foreignKey({
      columns: [t.caseId, t.assessmentId, t.version],
      foreignColumns: [
        assessmentVersions.caseId,
        assessmentVersions.assessmentId,
        assessmentVersions.version,
      ],
    }).onDelete("cascade"),
    check("assessment_version_observations_version_check", sql`${t.version} >= 1`),
    check("assessment_version_observations_position_check", sql`${t.position} >= 0`),
    check("assessment_version_observations_criterion_check", sql`length(${t.criterion}) <= 200`),
    check("assessment_version_observations_text_check", sql`length(${t.text}) <= 5000`),
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
