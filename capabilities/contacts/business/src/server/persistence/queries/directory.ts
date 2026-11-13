import { and, eq } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { organizations, memberships } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";

import { contacts } from "../schema";

export const readContacts = (db: Database, userId: string, workspaceSlug: string) =>
  db
    .select({
      workspaceName: organizations.name,
      organizationId: organizations.id,
      contact: {
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        affiliation: contacts.affiliation,
        archived: contacts.archived,
        revision: contacts.revision,
      },
    })
    .from(organizations)
    .leftJoin(contacts, eq(organizations.id, contacts.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(organizations.slug, workspaceSlug),
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    )
    .orderBy(contacts.name, contacts.email, contacts.id);
