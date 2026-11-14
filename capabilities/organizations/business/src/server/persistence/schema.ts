import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";

import { appUsers } from "@merit/auth/schema";

import { organizations } from "./membership-schema";

export const invitations = pgTable(
  "organization_invitations",
  {
    id: text().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text().notNull(),
    purpose: text({ enum: ["provisioning", "team"] })
      .notNull()
      .default("provisioning"),
    administration: text({ enum: ["none", "administrator", "owner"] })
      .notNull()
      .default("owner"),
    role: text({ enum: ["member", "program_manager", "reviewer"] })
      .notNull()
      .default("program_manager"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by").references(() => appUsers.id),
    delivery: text({ enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
  },
  (table) => [
    index("organization_invitations_organization_idx").on(table.organizationId),
    uniqueIndex("organization_invitations_pending_key")
      .on(table.organizationId, table.email)
      .where(sql`${table.revokedAt} IS NULL AND ${table.acceptedAt} IS NULL`),
    uniqueIndex("organization_invitations_provisioning_key")
      .on(table.organizationId)
      .where(sql`${table.purpose} = 'provisioning' AND ${table.revokedAt} IS NULL`),
    check(
      "organization_invitations_access_check",
      sql`(${table.purpose} = 'provisioning' AND ${table.administration} = 'owner' AND ${table.role} = 'program_manager') OR (${table.purpose} = 'team' AND ${table.administration} IN ('none', 'administrator') AND ${table.role} IN ('member', 'program_manager', 'reviewer'))`,
    ),
    check(
      "organization_invitations_delivery_check",
      sql`${table.delivery} IN ('pending', 'sent', 'failed')`,
    ),
  ],
);
