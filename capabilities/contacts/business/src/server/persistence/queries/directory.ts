import { eq } from "drizzle-orm";

import type { Database } from "@merit/db";
import { authorizedWorkspaces } from "@merit/organizations/scope";

import { contacts } from "../schema";

export const readContacts = (db: Database, userId: string, workspaceSlug: string) => {
  const workspace = authorizedWorkspaces(db, userId, "work_on_grants", workspaceSlug);
  return db
    .select({
      workspaceName: workspace.name,
      organizationId: workspace.id,
      contact: {
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        affiliation: contacts.affiliation,
        archived: contacts.archived,
        revision: contacts.revision,
      },
    })
    .from(workspace)
    .leftJoin(contacts, eq(workspace.id, contacts.organizationId))
    .orderBy(contacts.name, contacts.email, contacts.id);
};
