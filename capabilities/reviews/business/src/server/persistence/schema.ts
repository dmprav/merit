import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
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
import {
  enumCheck,
  moneyMinorUnits,
  nonBlankCheck,
  nonNegativeCheck,
  optimisticRevision,
  positiveCheck,
  recordedAt,
  uuidPk,
} from "@merit/db/schema";
import { fundingRounds, criteriaVersions } from "@merit/rounds/schema";

export const reviewRequests = pgTable(
  "review_requests",
  {
    organizationId: text("organization_id").notNull(),
    caseId: text("case_id").notNull(),
    id: uuid().notNull(),
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
    index("review_requests_round_idx").on(t.organizationId, t.criteriaRoundPublicId),
    index("review_requests_case_idx").on(t.organizationId, t.caseId),
    index("review_requests_contact_idx").on(t.organizationId, t.contactId),
    index("review_requests_material_idx").on(t.caseId, t.applicationVersion),
    index("review_requests_criteria_idx").on(t.criteriaRoundPublicId, t.criteriaVersion),
    enumCheck("review_requests_status_check", t.status, ["outstanding", "received", "cancelled"]),
    nonNegativeCheck("review_requests_position_check", t.position),
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
    id: uuid().notNull(),
    contactId: uuid("contact_id").notNull(),
    reviewer: text().notNull(),
    requestId: uuid("request_id"),
    previousId: uuid("previous_id"),
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
    index("assessments_case_idx").on(t.organizationId, t.caseId),
    index("assessments_contact_idx").on(t.organizationId, t.contactId),
    index("assessments_author_user_idx").on(t.authorUserId),
    index("assessments_previous_idx").on(t.caseId, t.previousId),
    nonNegativeCheck("assessments_position_check", t.position),
  ],
);

export const assessmentVersions = pgTable(
  "assessment_versions",
  {
    organizationId: text("organization_id").notNull(),
    caseId: text("case_id").notNull(),
    assessmentId: uuid("assessment_id").notNull(),
    version: integer().notNull(),
    applicationVersion: integer("material_version"),
    criteriaRoundPublicId: text("criteria_round_id"),
    criteriaVersion: integer("criteria_version"),
    assessedOn: date("assessed_on"),
    position: text(),
    amountMinorUnits: moneyMinorUnits("amount_minor_units"),
    amountCurrency: text("amount_currency").$type<"EUR">(),
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
    index("assessment_versions_case_idx").on(t.organizationId, t.caseId),
    index("assessment_versions_round_idx").on(t.organizationId, t.criteriaRoundPublicId),
    index("assessment_versions_material_idx").on(t.caseId, t.applicationVersion),
    index("assessment_versions_criteria_idx").on(t.criteriaRoundPublicId, t.criteriaVersion),
    positiveCheck("assessment_versions_version_check", t.version),
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
      sql`(${t.amountMinorUnits} is null) = (${t.amountCurrency} is null) and (${t.amountMinorUnits} is null or (${t.amountMinorUnits} >= 0 and ${t.amountMinorUnits} <> 'NaN' and ${t.amountCurrency} = 'EUR'))`,
    ),
    check(
      "assessment_versions_position_amount_check",
      sql`${t.position} is null or ${t.amountMinorUnits} is null or (${t.position} in ('Decline', 'Defer')) = (${t.amountMinorUnits} = 0)`,
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
    assessmentId: uuid("assessment_id").notNull(),
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
    positiveCheck("assessment_version_observations_version_check", t.version),
    nonNegativeCheck("assessment_version_observations_position_check", t.position),
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
    revision: optimisticRevision(),
  },
  (t) => [nonNegativeCheck("review_states_revision_check", t.revision)],
);

/** A saved AI review run. Immutable: runs are never edited or deleted, only removed with their workspace. */
export const aiReviews = pgTable(
  "ai_reviews",
  {
    id: uuidPk(),
    organizationId: text("organization_id").notNull(),
    // The identity of one run, so a retry of the same run returns its saved review.
    runId: uuid("run_id").notNull(),
    caseId: text("case_id").notNull(),
    applicationVersion: integer("application_version").notNull(),
    roundId: text("round_id").notNull(),
    criteriaVersion: integer("criteria_version").notNull(),
    provider: text().notNull(),
    model: text().notNull(),
    runByUserId: text("run_by_user_id").notNull(),
    runByName: text("run_by_name").notNull(),
    provenanceInterface: text("provenance_interface").notNull(),
    provenanceClientId: text("provenance_client_id"),
    recordedAt: recordedAt(),
    position: text().notNull(),
    amountMinorUnits: moneyMinorUnits("amount_minor_units").notNull(),
    amountCurrency: text("amount_currency").$type<"EUR">().notNull(),
    reasoning: text().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.caseId],
      foreignColumns: [applicationCases.organizationId, applicationCases.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.roundId],
      foreignColumns: [fundingRounds.organizationId, fundingRounds.id],
    }),
    foreignKey({
      columns: [t.caseId, t.applicationVersion],
      foreignColumns: [materialVersions.caseId, materialVersions.version],
    }),
    foreignKey({
      columns: [t.roundId, t.criteriaVersion],
      foreignColumns: [criteriaVersions.roundPublicId, criteriaVersions.version],
    }),
    unique("ai_reviews_run_key").on(t.organizationId, t.runId),
    index("ai_reviews_case_idx").on(t.organizationId, t.caseId, t.recordedAt.desc()),
    index("ai_reviews_round_idx").on(t.organizationId, t.roundId),
    index("ai_reviews_application_idx").on(t.caseId, t.applicationVersion),
    index("ai_reviews_criteria_idx").on(t.roundId, t.criteriaVersion),
    positiveCheck("ai_reviews_application_version_check", t.applicationVersion),
    positiveCheck("ai_reviews_criteria_version_check", t.criteriaVersion),
    nonBlankCheck("ai_reviews_provider_check", t.provider),
    nonBlankCheck("ai_reviews_model_check", t.model),
    enumCheck("ai_reviews_position_check", t.position, [
      "Fund",
      "Fund with a condition",
      "Defer",
      "Decline",
    ]),
    check(
      "ai_reviews_amount_check",
      sql`${t.amountMinorUnits} >= 0 and ${t.amountMinorUnits} <> 'NaN' and ${t.amountCurrency} = 'EUR'`,
    ),
    check(
      "ai_reviews_position_amount_check",
      sql`(${t.position} in ('Decline', 'Defer')) = (${t.amountMinorUnits} = 0)`,
    ),
    check(
      "ai_reviews_reasoning_check",
      sql`length(btrim(${t.reasoning})) > 0 and length(${t.reasoning}) <= 20000`,
    ),
    check(
      "ai_reviews_provenance_check",
      sql`(${t.provenanceInterface} = 'web' and ${t.provenanceClientId} is null) or (${t.provenanceInterface} = 'mcp' and ${t.provenanceClientId} is not null and length(btrim(${t.provenanceClientId})) > 0)`,
    ),
  ],
);

export const aiReviewSections = pgTable(
  "ai_review_sections",
  {
    organizationId: text("organization_id").notNull(),
    aiReviewId: uuid("ai_review_id").notNull(),
    ordinal: integer().notNull(),
    // Null stands for the whole application, when the round has no criteria.
    criterionId: uuid("criterion_id"),
    criterionTitle: text("criterion_title").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.aiReviewId, t.ordinal] }),
    foreignKey({
      columns: [t.aiReviewId],
      foreignColumns: [aiReviews.id],
    }).onDelete("cascade"),
    nonNegativeCheck("ai_review_sections_ordinal_check", t.ordinal),
    nonBlankCheck("ai_review_sections_title_check", t.criterionTitle),
    check("ai_review_sections_title_length_check", sql`length(${t.criterionTitle}) <= 200`),
  ],
);

const itemKinds = ["claim", "gap", "strength", "weakness", "concern"] as const;

export const aiReviewItems = pgTable(
  "ai_review_items",
  {
    organizationId: text("organization_id").notNull(),
    aiReviewId: uuid("ai_review_id").notNull(),
    sectionOrdinal: integer("section_ordinal").notNull(),
    kind: text({ enum: itemKinds }).notNull(),
    ordinal: integer().notNull(),
    text: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.aiReviewId, t.sectionOrdinal, t.kind, t.ordinal] }),
    foreignKey({
      columns: [t.aiReviewId, t.sectionOrdinal],
      foreignColumns: [aiReviewSections.aiReviewId, aiReviewSections.ordinal],
    }).onDelete("cascade"),
    enumCheck("ai_review_items_kind_check", t.kind, itemKinds),
    nonNegativeCheck("ai_review_items_ordinal_check", t.ordinal),
    nonBlankCheck("ai_review_items_text_check", t.text),
    check("ai_review_items_text_length_check", sql`length(${t.text}) <= 2000`),
  ],
);

export const aiReviewCitations = pgTable(
  "ai_review_citations",
  {
    organizationId: text("organization_id").notNull(),
    aiReviewId: uuid("ai_review_id").notNull(),
    sectionOrdinal: integer("section_ordinal").notNull(),
    // Only claims carry citations; the foreign key to the item pins the kind.
    kind: text({ enum: ["claim"] })
      .notNull()
      .default("claim"),
    itemOrdinal: integer("item_ordinal").notNull(),
    ordinal: integer().notNull(),
    source: text().notNull(),
    quote: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.aiReviewId, t.sectionOrdinal, t.itemOrdinal, t.ordinal] }),
    foreignKey({
      columns: [t.aiReviewId, t.sectionOrdinal, t.kind, t.itemOrdinal],
      foreignColumns: [
        aiReviewItems.aiReviewId,
        aiReviewItems.sectionOrdinal,
        aiReviewItems.kind,
        aiReviewItems.ordinal,
      ],
    }).onDelete("cascade"),
    index("ai_review_citations_claim_idx").on(
      t.aiReviewId,
      t.sectionOrdinal,
      t.kind,
      t.itemOrdinal,
    ),
    enumCheck("ai_review_citations_kind_check", t.kind, ["claim"]),
    nonNegativeCheck("ai_review_citations_ordinal_check", t.ordinal),
    nonBlankCheck("ai_review_citations_source_check", t.source),
    nonBlankCheck("ai_review_citations_quote_check", t.quote),
    check("ai_review_citations_quote_length_check", sql`length(${t.quote}) <= 500`),
  ],
);

export const aiReviewQuestions = pgTable(
  "ai_review_questions",
  {
    organizationId: text("organization_id").notNull(),
    aiReviewId: uuid("ai_review_id").notNull(),
    ordinal: integer().notNull(),
    text: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.aiReviewId, t.ordinal] }),
    foreignKey({
      columns: [t.aiReviewId],
      foreignColumns: [aiReviews.id],
    }).onDelete("cascade"),
    nonNegativeCheck("ai_review_questions_ordinal_check", t.ordinal),
    nonBlankCheck("ai_review_questions_text_check", t.text),
    check("ai_review_questions_text_length_check", sql`length(${t.text}) <= 2000`),
  ],
);
