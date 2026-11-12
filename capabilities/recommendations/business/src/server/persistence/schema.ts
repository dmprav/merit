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
} from "drizzle-orm/pg-core";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import type { Provenance } from "@merit/auth";
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
    content: jsonb().notNull(),
    actorUserId: text("actor_user_id").references(() => appUsers.id),
    provenance: jsonb().$type<Provenance>(),
    recordedAt: recordedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.revision] }),
    foreignKey({
      columns: [t.caseId, t.applicationVersion],
      foreignColumns: [materialVersions.caseId, materialVersions.version],
    }),
    check("recommendation_version_positive", sql`${t.revision} > 0`),
  ],
);
