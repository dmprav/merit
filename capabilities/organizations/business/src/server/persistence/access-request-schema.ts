import { index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { appUsers } from "@merit/auth/schema";
import { positiveCheck, uuidPk } from "@merit/db/schema";

export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuidPk(),
    email: text().notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by").references(() => appUsers.id),
  },
  (table) => [
    unique("access_requests_email_key").on(table.email),
    index("access_requests_reviewed_by_idx").on(table.reviewedBy),
  ],
);

export const accessRequestLimits = pgTable(
  "access_request_limits",
  {
    key: text().primaryKey(),
    attempts: integer().notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("access_request_limits_expiry_idx").on(table.expiresAt),
    positiveCheck("access_request_limits_attempts_check", table.attempts),
  ],
);
