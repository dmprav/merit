import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { appUsers } from "@merit/auth/schema";
import {
  enumCheck,
  nonNegativeCheck,
  optimisticRevision,
  publicId,
  recordedAt,
} from "@merit/db/schema";

import { organizations } from "./membership-schema";

// Presence records an active opt-in. The workspace is the unit of consent.
export const assistantConsents = pgTable("assistant_consents", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
});

const assistantStatuses = [
  "idle",
  "running",
  "awaiting_approval",
  "completed",
  "stopped",
  "failed",
  "unavailable",
] as const;

export const assistantConversations = pgTable(
  "assistant_conversations",
  {
    id: publicId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id),
    // Historical membership identity survives removal so rejoining cannot expose this chat.
    membershipId: uuid("membership_id").notNull(),
    revision: optimisticRevision(),
    status: text({ enum: assistantStatuses }).notNull(),
    // One runtime checkpoint preserves ordered turns, evidence provenance and approval receipts atomically.
    state: jsonb().notNull(),
    createdAt: recordedAt("created_at"),
    updatedAt: recordedAt("updated_at"),
  },
  (table) => [
    nonNegativeCheck("assistant_conversations_revision_check", table.revision),
    enumCheck("assistant_conversations_status_check", table.status, assistantStatuses),
    check("assistant_conversations_state_check", sql`jsonb_typeof(${table.state}) = 'object'`),
    index("assistant_conversations_owner_idx").on(
      table.organizationId,
      table.userId,
      table.updatedAt,
    ),
    index("assistant_conversations_user_idx").on(table.userId),
    index("assistant_conversations_running_idx")
      .on(table.id)
      .where(sql`${table.status} = 'running'`),
  ],
);
