import { and, eq, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { workingRevision } from "@merit/applications/scope";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";
import { recommendationRevision } from "@merit/recommendations/scope";
import { roundAllocations } from "@merit/recommendations/scope";
import { fundingRounds } from "@merit/rounds/schema";
import { managerNeedsReassignment } from "@merit/rounds/scope";
import { roundRecord } from "@merit/rounds/scope";

import { currentApplicationRecord, moneyData } from "../projections";

// Compose the overview in one authorized database snapshot; neither root stores this view.
export const readPublicRound = async (
  db: Database,
  userId: string,
  input: { workspaceSlug: string; publicId: string },
) => {
  const belongsToRound = sql`${applicationCases.organizationId} = ${fundingRounds.organizationId} and ${applicationCases.roundId} = ${fundingRounds.id}`;
  const [row] = await db
    .select({
      record: roundRecord,
      organizationId: fundingRounds.organizationId,
      revision: fundingRounds.revision,
      managerNeedsReassignment,
      workspaceSlug: organizations.slug,
      applications: sql<
        unknown[]
      >`(select coalesce(jsonb_agg(${currentApplicationRecord} order by ${applicationCases.position}), '[]'::jsonb) from ${applicationCases} where ${belongsToRound})`,
    })
    .from(fundingRounds)
    .innerJoin(organizations, eq(organizations.id, fundingRounds.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, fundingRounds.organizationId))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(organizations.slug, input.workspaceSlug),
        eq(fundingRounds.id, input.publicId),
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    );
  if (!row) {
    return null;
  }

  return {
    organizationId: row.organizationId,
    revision: row.revision,
    snapshot: {
      ...(row.record as Record<string, unknown>),
      managerNeedsReassignment: row.managerNeedsReassignment,
      applications: row.applications,
    },
    workspaceSlug: row.workspaceSlug,
  };
};

// Only the selected case's content and sibling allocations cross the database seam.
export const readApplicationDetail = async (
  db: Database,
  userId: string,
  input: { workspaceSlug: string; publicId: string },
) => {
  const [row] = await db
    .select({
      application: currentApplicationRecord,
      round: roundRecord,
      allocations: roundAllocations,
      workspaceSlug: organizations.slug,
      publicId: applicationCases.id,
      recommendationVersion: recommendationRevision,
      intakeRevision: applicationCases.revision,
      workingRevision,
    })
    .from(applicationCases)
    .innerJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .innerJoin(organizations, eq(organizations.id, applicationCases.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(organizations.slug, input.workspaceSlug),
        eq(applicationCases.id, input.publicId),
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    );
  return row ?? null;
};

export const listRoundSummaries = (db: Database, userId: string, workspaceSlug: string) => {
  const grantAccess = organizationScope(userId, "work_on_grants", organizations.id);

  return db
    .select({
      canWorkOnGrants: sql<boolean>`${grantAccess}`,
      organizationId: organizations.id,
      organizationName: organizations.name,
      workspaceSlug: organizations.slug,
      publicId: fundingRounds.id,
      title: fundingRounds.title,
      decisionStatus: fundingRounds.decisionStatus,
      meetingDate: fundingRounds.meetingDate,
      budget: moneyData(sql`${fundingRounds.budget}`),
      applicationCount: sql<number>`(select count(*)::integer from ${applicationCases} where ${applicationCases.organizationId} = ${fundingRounds.organizationId} and ${applicationCases.roundId} = ${fundingRounds.id})`,
    })
    .from(organizations)
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .leftJoin(fundingRounds, and(eq(fundingRounds.organizationId, organizations.id), grantAccess))
    .where(
      and(
        eq(organizations.slug, workspaceSlug),
        organizationScope(userId, "read_workspace", organizations.id),
      ),
    )
    .orderBy(organizations.name, fundingRounds.title, fundingRounds.id);
};
