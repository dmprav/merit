import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { Provenance } from "@merit/auth";
import { appUsers } from "@merit/auth/schema";
import { organizations } from "@merit/organizations/schema";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => appUsers.id),
    actorName: text("actor_name"),
    provenance: jsonb().$type<Provenance>().notNull(),
    action: text().notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetRevision: integer("target_revision"),
    recordedAt: timestamp("recorded_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_workspace_time_idx").on(table.organizationId, table.recordedAt, table.id),
  ],
);
