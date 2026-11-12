import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appUsers = pgTable("app_users", {
  id: text().primaryKey(),
  clerkUserId: text("clerk_user_id").unique("app_users_clerk_user_id_key"),
  name: text(),
  active: boolean().notNull().default(true),
});

export const guestSessions = pgTable(
  "guest_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("guest_sessions_expiry_idx").on(table.expiresAt)],
);
