import { and, eq, gt } from "drizzle-orm";

import type { Database } from "@merit/db";
import { authorizedWorkspaces } from "@merit/organizations/scope";

import { contacts } from "../schema";

const fields = {
  contactId: contacts.id,
  name: contacts.name,
  email: contacts.email,
  affiliation: contacts.affiliation,
  archived: contacts.archived,
  contactRevision: contacts.revision,
};

export const readContactWorkspace = async (db: Database, actor: string, slug: string) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", slug);
  return (await db.select({ id: workspace.id }).from(workspace))[0];
};

export const readContactSummaries = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; after?: string; limit: number; archived?: boolean },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  return db
    .select(fields)
    .from(contacts)
    .innerJoin(workspace, eq(workspace.id, contacts.organizationId))
    .where(
      and(
        input.after ? gt(contacts.id, input.after) : undefined,
        input.archived === undefined ? undefined : eq(contacts.archived, input.archived),
      ),
    )
    .orderBy(contacts.id)
    .limit(input.limit + 1);
};

export const readContactDetails = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; contactId: string },
) => {
  const workspace = authorizedWorkspaces(db, actor, "work_on_grants", input.workspaceSlug);
  return (
    await db
      .select(fields)
      .from(contacts)
      .innerJoin(workspace, eq(workspace.id, contacts.organizationId))
      .where(eq(contacts.id, input.contactId))
  )[0];
};
