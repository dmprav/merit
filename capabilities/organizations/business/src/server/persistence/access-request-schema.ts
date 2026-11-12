import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { appUsers } from "@merit/auth/schema";

export const accessRequests = pgTable("access_requests", {
  email: text().primaryKey(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by").references(() => appUsers.id),
});

export const accessRequestLimits = pgTable(
  "access_request_limits",
  {
    key: text().primaryKey(),
    attempts: integer().notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("access_request_limits_expiry_idx").on(table.expiresAt)],
);
