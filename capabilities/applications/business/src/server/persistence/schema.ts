import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
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
    roundId: text("round_id").notNull(),
    position: integer().notNull().default(0),
    materialVersion: integer("material_version").notNull(),
    revision: integer().notNull().default(0),
    contactId: uuid("contact_id"),
    intakeStatus: text("intake_status", { enum: ["in_preparation", "ready"] }).notNull(),
    withdrawnOn: date("withdrawn_on"),
    withdrawalReason: text("withdrawal_reason"),
    withdrawalRecorderUserId: text("withdrawal_recorder_user_id"),
    withdrawalRecorderName: text("withdrawal_recorder_name"),
    withdrawalRecordedAt: timestamp("withdrawal_recorded_at", { withTimezone: true }),
    // The current recorded title and applicant, kept beside `material_version` for workspace search.
    searchTitle: text("search_title").notNull().default(""),
    searchApplicant: text("search_applicant").notNull().default(""),
    summary: text().notNull().default(""),
    summaryAuthorUserId: text("summary_author_user_id"),
    summaryAuthorName: text("summary_author_name"),
    summaryRecordedAt: timestamp("summary_recorded_at", { withTimezone: true }),
    attention: text().array().notNull().default([]),
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
    check(
      "application_cases_withdrawal_check",
      sql`(${t.withdrawnOn} IS NULL AND ${t.withdrawalReason} IS NULL AND ${t.withdrawalRecorderUserId} IS NULL AND ${t.withdrawalRecorderName} IS NULL AND ${t.withdrawalRecordedAt} IS NULL) OR (${t.withdrawnOn} IS NOT NULL AND ${t.withdrawalReason} IS NOT NULL AND ${t.withdrawalRecorderUserId} IS NOT NULL AND ${t.withdrawalRecorderName} IS NOT NULL AND ${t.withdrawalRecordedAt} IS NOT NULL)`,
    ),
    check(
      "application_cases_summary_author_check",
      sql`(${t.summaryAuthorUserId} IS NULL AND ${t.summaryAuthorName} IS NULL AND ${t.summaryRecordedAt} IS NULL) OR (${t.summaryAuthorUserId} IS NOT NULL AND ${t.summaryAuthorName} IS NOT NULL AND ${t.summaryRecordedAt} IS NOT NULL)`,
    ),
  ],
);
export const materialVersions = pgTable(
  "material_versions",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => applicationCases.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    title: text().notNull(),
    requestedMinorUnits: numeric("requested_minor_units", { precision: 30, scale: 0 }),
    requestedCurrency: text("requested_currency"),
    hasSubmission: boolean("has_submission").notNull().default(false),
    submissionVersion: integer("submission_version"),
    applicantOrganization: text("applicant_organization"),
    submittedOn: date("submitted_on"),
    projectPeriod: text("project_period"),
    changeKind: text("change_kind").notNull(),
    sourceKind: text("source_kind", { enum: ["recorded_external", "fictional_example"] })
      .notNull()
      .default("recorded_external"),
    reason: text(),
    recordedByUserId: text("recorded_by_user_id").references(() => appUsers.id),
    recordedAt: recordedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.version] }),
    check("material_version_positive", sql`${t.version} > 0`),
    check(
      "material_requested_check",
      sql`(${t.requestedMinorUnits} IS NULL) = (${t.requestedCurrency} IS NULL) AND (${t.requestedMinorUnits} IS NULL OR (${t.requestedMinorUnits} >= 0 AND ${t.requestedCurrency} = 'EUR'))`,
    ),
    check(
      "material_submission_check",
      sql`(NOT ${t.hasSubmission} AND ${t.submissionVersion} IS NULL AND ${t.applicantOrganization} IS NULL AND ${t.submittedOn} IS NULL AND ${t.projectPeriod} IS NULL) OR (${t.hasSubmission} AND ${t.submissionVersion} IS NOT NULL AND ${t.submissionVersion} > 0)`,
    ),
    check(
      "material_source_kind_check",
      sql`${t.sourceKind} IN ('recorded_external', 'fictional_example')`,
    ),
  ],
);
export const materialVersionAnswers = pgTable(
  "material_version_answers",
  {
    caseId: text("case_id").notNull(),
    materialVersion: integer("material_version").notNull(),
    position: integer().notNull(),
    questionId: uuid("question_id").notNull(),
    question: text().notNull(),
    response: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.materialVersion, t.position] }),
    foreignKey({
      columns: [t.caseId, t.materialVersion],
      foreignColumns: [materialVersions.caseId, materialVersions.version],
    }).onDelete("cascade"),
    unique("material_version_answers_question_key").on(t.caseId, t.materialVersion, t.questionId),
    check("material_version_answers_position_check", sql`${t.position} >= 0`),
  ],
);
export const materialVersionEvidence = pgTable(
  "material_version_evidence",
  {
    caseId: text("case_id").notNull(),
    materialVersion: integer("material_version").notNull(),
    position: integer().notNull(),
    evidenceVersion: integer("evidence_version").notNull(),
    passage: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.materialVersion, t.position] }),
    foreignKey({
      columns: [t.caseId, t.materialVersion],
      foreignColumns: [materialVersions.caseId, materialVersions.version],
    }).onDelete("cascade"),
    check("material_version_evidence_position_check", sql`${t.position} >= 0`),
    check("material_version_evidence_version_check", sql`${t.evidenceVersion} > 0`),
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
    title: text().notNull(),
    applicant: text().notNull(),
    projectPeriod: text("project_period"),
    requested: text().notNull(),
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
export const materialDraftAnswers = pgTable(
  "material_draft_answers",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => materialDrafts.caseId, { onDelete: "cascade" }),
    position: integer().notNull(),
    questionId: uuid("question_id").notNull(),
    question: text().notNull(),
    response: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.position] }),
    unique("material_draft_answers_question_key").on(t.caseId, t.questionId),
    check("material_draft_answers_position_check", sql`${t.position} >= 0`),
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

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => Uint8Array.from(value),
});

/** One proposal or budget slot. An empty slot has no row and is not a version. */
export const sourceDocuments = pgTable(
  "source_documents",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => applicationCases.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role").notNull(),
    currentVersion: integer("current_version").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.role] }),
    check("source_documents_role_check", sql`${t.role} in ('proposal', 'budget')`),
    check("source_documents_current_version_check", sql`${t.currentVersion} > 0`),
  ],
);

export const sourceDocumentVersions = pgTable(
  "source_document_versions",
  {
    caseId: text("case_id").notNull(),
    role: text("role").notNull(),
    version: integer().notNull(),
    filename: text().notNull(),
    pageCount: integer("page_count").notNull(),
    byteSize: integer("byte_size").notNull(),
    content: bytea("content").notNull(),
    recorderUserId: text("recorder_user_id")
      .notNull()
      .references(() => appUsers.id),
    recorderName: text("recorder_name").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.role, t.version] }),
    foreignKey({
      columns: [t.caseId, t.role],
      foreignColumns: [sourceDocuments.caseId, sourceDocuments.role],
    }).onDelete("cascade"),
    check("source_document_versions_role_check", sql`${t.role} in ('proposal', 'budget')`),
    check("source_document_versions_version_check", sql`${t.version} > 0`),
    check("source_document_versions_pages_check", sql`${t.pageCount} > 0`),
    check(
      "source_document_versions_bytes_check",
      sql`${t.byteSize} between 1 and 20971520 and octet_length(${t.content}) = ${t.byteSize}`,
    ),
    check(
      "source_document_versions_filename_check",
      sql`char_length(${t.filename}) between 1 and 200`,
    ),
  ],
);

export const sourceDocumentCitations = pgTable(
  "source_document_citations",
  {
    id: text("id")
      .primaryKey()
      .default(sql`merit_public_id()`),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: text("case_id").notNull(),
    role: text("role").notNull(),
    version: integer().notNull(),
    page: integer().notNull(),
    note: text(),
    recorderUserId: text("recorder_user_id")
      .notNull()
      .references(() => appUsers.id),
    recorderName: text("recorder_name").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.caseId, t.role, t.version],
      foreignColumns: [
        sourceDocumentVersions.caseId,
        sourceDocumentVersions.role,
        sourceDocumentVersions.version,
      ],
    }).onDelete("cascade"),
    index("source_document_citations_case_role_recorded_idx").on(t.caseId, t.role, t.recordedAt),
    check("source_document_citations_role_check", sql`${t.role} in ('proposal', 'budget')`),
    check("source_document_citations_version_check", sql`${t.version} > 0`),
    check("source_document_citations_page_check", sql`${t.page} > 0`),
    check(
      "source_document_citations_note_check",
      sql`${t.note} is null or char_length(${t.note}) between 1 and 2000`,
    ),
  ],
);
