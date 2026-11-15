import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import { appUsers } from "@merit/auth/schema";

const recordedAt = () => timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow();

export const recommendationVersions = pgTable(
  "recommendation_versions",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => applicationCases.id, { onDelete: "cascade" }),
    revision: integer().notNull(),
    applicationVersion: integer("material_version"),
    recordedDate: date("recorded_date"),
    position: text({ enum: ["Fund", "Fund with a condition", "Defer"] }).notNull(),
    allocationMinorUnits: numeric("allocation_minor_units", { precision: 30, scale: 0 }).notNull(),
    allocationCurrency: text("allocation_currency").notNull().default("EUR"),
    reasoning: text().notNull(),
    authorUserId: text("author_user_id"),
    authorName: text("author_name"),
    authorProvenanceInterface: text("author_provenance_interface"),
    authorProvenanceClientId: text("author_provenance_client_id"),
    actorUserId: text("actor_user_id").references(() => appUsers.id),
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
    check("recommendation_version_positive", sql`${t.revision} > 0`),
    check(
      "recommendation_position_check",
      sql`${t.position} IN ('Fund', 'Fund with a condition', 'Defer')`,
    ),
    check(
      "recommendation_allocation_check",
      sql`${t.allocationMinorUnits} >= 0 AND ${t.allocationCurrency} = 'EUR' AND ((${t.position} = 'Defer' AND ${t.allocationMinorUnits} = 0) OR (${t.position} IN ('Fund', 'Fund with a condition') AND ${t.allocationMinorUnits} > 0))`,
    ),
    check("recommendation_reasoning_check", sql`length(btrim(${t.reasoning})) > 0`),
    check(
      "recommendation_recorded_check",
      sql`(${t.recordedDate} IS NULL) = (${t.applicationVersion} IS NULL)`,
    ),
    check(
      "recommendation_author_check",
      sql`${t.authorName} IS NOT NULL OR (${t.authorUserId} IS NULL AND ${t.authorProvenanceInterface} IS NULL AND ${t.authorProvenanceClientId} IS NULL)`,
    ),
    check(
      "recommendation_author_provenance_check",
      sql`(${t.authorProvenanceInterface} IS NULL AND ${t.authorProvenanceClientId} IS NULL) OR (${t.authorProvenanceInterface} = 'web' AND ${t.authorProvenanceClientId} IS NULL) OR (${t.authorProvenanceInterface} = 'mcp' AND ${t.authorProvenanceClientId} IS NOT NULL AND length(${t.authorProvenanceClientId}) > 0)`,
    ),
    check(
      "recommendation_provenance_check",
      sql`(${t.provenanceInterface} IS NULL AND ${t.provenanceClientId} IS NULL) OR (${t.provenanceInterface} = 'web' AND ${t.provenanceClientId} IS NULL) OR (${t.provenanceInterface} = 'mcp' AND ${t.provenanceClientId} IS NOT NULL AND length(${t.provenanceClientId}) > 0)`,
    ),
  ],
);
