import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { appUsers } from "@merit/auth/schema";

const workspaceScope = sql`(SELECT merit_scope()->>'kind') IN ('workspace', 'assignment')
  AND organization_id IN (SELECT merit_workspace_ids())`;

export const workspaceFiles = pgTable(
  "workspace_files",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Migration 0001 installs the organization FK without a reverse capability dependency.
    organizationId: text("organization_id").notNull(),
    requestId: uuid("request_id").notNull(),
    objectKey: text("object_key")
      .generatedAlwaysAs(sql`'files/' || id::text`)
      .notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    byteLength: bigint("byte_length", { mode: "number" }).notNull(),
    sha256: text().notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    unique("workspace_files_owner_key").on(table.organizationId, table.id),
    unique("workspace_files_request_key").on(table.organizationId, table.requestId),
    check("workspace_files_length_check", sql`${table.byteLength} >= 0`),
    pgPolicy("workspace_file_read", { for: "select", using: workspaceScope }),
    pgPolicy("workspace_file_insert", {
      for: "insert",
      withCheck: sql`${workspaceScope}
    AND uploaded_by = (SELECT merit_scope()->>'userId')`,
    }),
  ],
).enableRLS();
