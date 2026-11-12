import { and, eq, gt } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";

import { contactChanges } from "../history-schema";
import { contacts } from "../schema";

const fields = {
  contactId: contacts.id,
  name: contacts.name,
  email: contacts.email,
  affiliation: contacts.affiliation,
  archived: contacts.archived,
  contactRevision: contacts.revision,
};

const scope = (actor: string, slug: string) =>
  and(eq(organizations.slug, slug), organizationScope(actor, "work_on_grants", organizations.id));

export const readContactWorkspace = async (db: Database, actor: string, slug: string) =>
  (
    await db
      .select({ id: organizations.id })
      .from(organizations)
      .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
      .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
      .where(scope(actor, slug))
  )[0];

export const readContactSummaries = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; after?: string; limit: number; archived?: boolean },
) =>
  db
    .select(fields)
    .from(contacts)
    .innerJoin(organizations, eq(organizations.id, contacts.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        scope(actor, input.workspaceSlug),
        input.after ? gt(contacts.id, input.after) : undefined,
        input.archived === undefined ? undefined : eq(contacts.archived, input.archived),
      ),
    )
    .orderBy(contacts.id)
    .limit(input.limit + 1);

export const readContactDetails = async (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; contactId: string },
) =>
  (
    await db
      .select(fields)
      .from(contacts)
      .innerJoin(organizations, eq(organizations.id, contacts.organizationId))
      .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
      .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
      .where(and(scope(actor, input.workspaceSlug), eq(contacts.id, input.contactId)))
  )[0];

export const readContactChanges = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; contactId: string; afterRevision?: number; limit: number },
) =>
  db
    .select({
      revision: contactChanges.revision,
      recordedAt: contactChanges.recordedAt,
      actorUserId: contactChanges.actorUserId,
      provenance: contactChanges.provenance,
      before: contactChanges.before,
      after: contactChanges.after,
    })
    .from(contactChanges)
    .innerJoin(contacts, eq(contacts.id, contactChanges.contactId))
    .innerJoin(organizations, eq(organizations.id, contacts.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        scope(actor, input.workspaceSlug),
        eq(contacts.id, input.contactId),
        input.afterRevision === undefined
          ? undefined
          : gt(contactChanges.revision, input.afterRevision),
      ),
    )
    .orderBy(contactChanges.revision)
    .limit(input.limit + 1);
