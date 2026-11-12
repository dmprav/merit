import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { organizations } from "@merit/organizations/schema";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    email: text().notNull().default(""),
    affiliation: text().notNull().default(""),
    archived: boolean().notNull().default(false),
    revision: integer().notNull().default(0),
  },
  (table) => [
    unique("contacts_owner_key").on(table.organizationId, table.id),
    check("contacts_identity_check", sql`${table.name} <> '' OR ${table.email} <> ''`),
    check("contacts_revision_check", sql`${table.revision} >= 0`),
  ],
);
