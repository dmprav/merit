import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { applicationCases } from "@merit/applications/schema";
import { appUsers } from "@merit/auth/schema";
import { nonNegativeCheck, uuidPk } from "@merit/db/schema";
import { reviewAssignments } from "@merit/reviews/participation-schema";
import { fundingRounds } from "@merit/rounds/schema";

export const navigationPins = pgTable(
  "grant_navigation_pins",
  {
    id: uuidPk(),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    roundId: text("round_id").references(() => fundingRounds.id, { onDelete: "cascade" }),
    applicationId: text("case_id").references(() => applicationCases.id, {
      onDelete: "cascade",
    }),
    assignmentId: uuid("assignment_id").references(() => reviewAssignments.id, {
      onDelete: "cascade",
    }),
    position: integer().notNull(),
  },
  (t) => [
    unique("grant_navigation_pins_round").on(t.userId, t.roundId),
    unique("grant_navigation_pins_application").on(t.userId, t.applicationId),
    unique("grant_navigation_pins_review").on(t.userId, t.assignmentId),
    index("grant_navigation_pins_round_idx").on(t.roundId),
    index("grant_navigation_pins_case_idx").on(t.applicationId),
    index("grant_navigation_pins_assignment_idx").on(t.assignmentId),
    check(
      "grant_navigation_pins_target",
      sql`num_nonnulls(${t.roundId}, ${t.applicationId}, ${t.assignmentId}) = 1`,
    ),
    nonNegativeCheck("grant_navigation_pins_position", t.position),
  ],
);
