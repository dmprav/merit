import { and, eq, sql, type SQLWrapper } from "drizzle-orm";

import type { AccessAction } from "@merit/access";
import { accessScope } from "@merit/access/scope";
import { appUsers } from "@merit/auth/schema";

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

export const activeOrganization = sql`(${organizations.kind} = 'standard' OR ${organizations.demoExpiresAt} > statement_timestamp())`;

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
      AND (accessible_organization.kind = 'standard'
        OR accessible_organization.demo_expires_at > statement_timestamp())
  )`,
  );
