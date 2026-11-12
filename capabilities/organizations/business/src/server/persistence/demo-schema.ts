import { integer, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

// Short-lived, hashed network buckets bound anonymous provisioning across Worker instances.
export const demoEntryLimits = pgTable(
  "demo_entry_limits",
  {
    key: text().primaryKey(),
    attempts: integer().notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("demo_entry_limits_expiry_idx").on(table.expiresAt)],
);
