import { and, eq, sql, type SQLWrapper } from "drizzle-orm";

import type { AccessAction } from "@merit/access";
import { accessScope } from "@merit/access/scope";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";

import { assistantConsents } from "./assistant-schema";
import { organizations, memberships } from "./membership-schema";

/** The query joins membership and user records; the policy checks the resource's organization. */
export const membershipScope = (action: AccessAction, organizationId: string | SQLWrapper) =>
  accessScope(action, {
    "subject.userId": appUsers.id,
    "subject.active": appUsers.active,
    "subject.organizationId": memberships.organizationId,
    "subject.administration": memberships.administration,
    "subject.role": memberships.role,
    "resource.organizationId": sql`${organizationId}`,
  });

export const activeOrganization = sql`merit_workspace_active(${organizations.kind}, ${organizations.demoExpiresAt})`;

export const organizationScope = (
  userId: string,
  action: AccessAction,
  organizationId: string | SQLWrapper,
) =>
  and(
    eq(appUsers.id, userId),
    membershipScope(action, organizationId),
    sql`EXISTS (
    SELECT 1 FROM ${organizations} AS accessible_organization
    WHERE accessible_organization.id = ${organizationId}
      AND merit_workspace_active(accessible_organization.kind, accessible_organization.demo_expires_at)
  )`,
  );

/** A relation of workspaces where this actor may perform the requested action. */
export const authorizedWorkspaces = (
  db: Database,
  userId: string,
  action: AccessAction,
  slug?: string,
) =>
  db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      kind: organizations.kind,
      demoExpiresAt: organizations.demoExpiresAt,
      membershipId: sql<string>`${memberships.id}`.as("actor_membership_id"),
      role: memberships.role,
      administration: memberships.administration,
      canWorkOnGrants: membershipScope("work_on_grants", organizations.id).as("can_work_on_grants"),
      canViewTeam: membershipScope("read_team", organizations.id).as("can_view_team"),
    })
    .from(organizations)
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(appUsers.id, userId),
        activeOrganization,
        membershipScope(action, organizations.id),
        slug === undefined ? undefined : eq(organizations.slug, slug),
      ),
    )
    .as("authorized_workspace");

/** Whether the workspace allows Merit to send material to the AI provider; read inside the caller's transaction. */
export const readAssistantConsent = async (db: Database, organizationId: string) => {
  const [consent] = await db
    .select()
    .from(assistantConsents)
    .where(eq(assistantConsents.organizationId, organizationId));
  return !!consent;
};
