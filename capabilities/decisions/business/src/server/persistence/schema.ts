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
} from "drizzle-orm/pg-core";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import { appUsers } from "@merit/auth/schema";
import { enumCheck, moneyMinorUnits, positiveCheck, recordedAt } from "@merit/db/schema";

const outcomes = ["Fund", "Fund with conditions", "Defer", "Decline"] as const;

/** Append-only versions of the committee's decision for an application; the head is current. */
export const committeeDecisionVersions = pgTable(
  "committee_decision_versions",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => applicationCases.id, { onDelete: "cascade" }),
    revision: integer().notNull(),
    outcome: text({ enum: outcomes }).notNull(),
    amountMinorUnits: moneyMinorUnits("amount_minor_units").notNull(),
    amountCurrency: text("amount_currency").notNull().default("EUR"),
    conditions: text(),
    reason: text().notNull(),
    decidedBy: text("decided_by").notNull(),
    decisionDate: date("decision_date").notNull(),
    changeExplanation: text("change_explanation"),
    applicationVersion: integer("material_version"),
    actorUserId: text("actor_user_id").references(() => appUsers.id),
    actorName: text("actor_name").notNull(),
    provenanceInterface: text("provenance_interface"),
    provenanceClientId: text("provenance_client_id"),
    recordedAt: recordedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.revision] }),
    foreignKey({
      columns: [t.caseId, t.applicationVersion],
      foreignColumns: [materialVersions.caseId, materialVersions.version],
    }),
    index("committee_decision_versions_material_idx").on(t.caseId, t.applicationVersion),
    index("committee_decision_versions_actor_user_idx").on(t.actorUserId),
    positiveCheck("committee_decision_version_positive", t.revision),
    enumCheck("committee_decision_outcome_check", t.outcome, outcomes),
    check(
      "committee_decision_amount_check",
      sql`${t.amountMinorUnits} >= 0 AND ${t.amountCurrency} = 'EUR' AND ((${t.outcome} IN ('Defer', 'Decline') AND ${t.amountMinorUnits} = 0) OR (${t.outcome} IN ('Fund', 'Fund with conditions') AND ${t.amountMinorUnits} > 0))`,
    ),
    check(
      "committee_decision_conditions_check",
      sql`(${t.outcome} = 'Fund with conditions') = (${t.conditions} IS NOT NULL AND length(btrim(${t.conditions})) > 0)`,
    ),
    check("committee_decision_reason_check", sql`length(btrim(${t.reason})) > 0`),
    check("committee_decision_decided_by_check", sql`length(btrim(${t.decidedBy})) > 0`),
    check(
      "committee_decision_explanation_check",
      sql`(${t.revision} = 1) = (${t.changeExplanation} IS NULL) AND (${t.changeExplanation} IS NULL OR length(btrim(${t.changeExplanation})) > 0)`,
    ),
    check(
      "committee_decision_provenance_check",
      sql`(${t.provenanceInterface} IS NULL AND ${t.provenanceClientId} IS NULL) OR (${t.provenanceInterface} = 'web' AND ${t.provenanceClientId} IS NULL) OR (${t.provenanceInterface} = 'mcp' AND ${t.provenanceClientId} IS NOT NULL AND length(${t.provenanceClientId}) > 0)`,
    ),
  ],
);
