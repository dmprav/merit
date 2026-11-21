import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, unique } from "drizzle-orm/pg-core";

import { nonNegativeCheck, optimisticRevision, uuidPk } from "@merit/db/schema";
import { organizations } from "@merit/organizations/schema";

export const contacts = pgTable(
  "contacts",
  {
    id: uuidPk(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    email: text().notNull().default(""),
    affiliation: text().notNull().default(""),
    archived: boolean().notNull().default(false),
    revision: optimisticRevision(),
  },
  (table) => [
    unique("contacts_owner_key").on(table.organizationId, table.id),
    check("contacts_identity_check", sql`${table.name} <> '' OR ${table.email} <> ''`),
    nonNegativeCheck("contacts_revision_check", table.revision),
  ],
);
