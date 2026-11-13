import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { Provenance } from "@merit/auth";
import { appUsers } from "@merit/auth/schema";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    // The baseline installs the organization FK without a reverse package dependency.
    organizationId: text("organization_id").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => appUsers.id),
    actorName: text("actor_name"),
    provenance: jsonb().$type<Provenance>(),
    action: text().notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetRevision: integer("target_revision"),
    targetName: text("target_name"),
    roundId: text("round_id"),
    applicationId: text("application_id"),
    assignmentId: text("assignment_id"),
    formatVersion: integer("format_version").notNull().default(1),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    recordedAt: timestamp("recorded_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_workspace_time_idx").on(table.organizationId, table.recordedAt, table.id),
    index("audit_events_subject_idx").on(
      table.organizationId,
      table.targetType,
      table.targetId,
      table.targetRevision,
    ),
    index("audit_events_subject_time_idx").on(
      table.organizationId,
      table.targetType,
      table.targetId,
      table.recordedAt,
      table.id,
    ),
    index("audit_events_round_time_idx").on(
      table.organizationId,
      table.roundId,
      table.recordedAt,
      table.id,
    ),
    index("audit_events_actor_time_idx").on(
      table.organizationId,
      table.actorUserId,
      table.recordedAt,
      table.id,
    ),
    index("audit_events_assignment_idx").on(
      table.organizationId,
      table.assignmentId,
      table.recordedAt,
      table.id,
    ),
  ],
);
