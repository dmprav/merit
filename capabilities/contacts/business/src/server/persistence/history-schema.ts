import { jsonb, pgTable, primaryKey, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";

import type { Provenance } from "@merit/auth";
import { appUsers } from "@merit/auth/schema";

import { contacts } from "./schema";

export const contactChanges = pgTable(
  "contact_changes",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    revision: integer().notNull(),
    actorUserId: text("actor_user_id").references(() => appUsers.id),
    provenance: jsonb().$type<Provenance>(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    before: jsonb(),
    after: jsonb().notNull(),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.revision] })],
);
