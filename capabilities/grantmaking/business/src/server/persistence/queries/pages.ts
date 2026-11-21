import { and, asc, eq, sql } from "drizzle-orm";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import {
  readIntakeApplicationsMap,
  readWorkingRevisionsMap,
  roundWithdrawnCount,
} from "@merit/applications/scope";
import type { Database } from "@merit/db";
import { authorizedWorkspaces } from "@merit/organizations/scope";
import { readCurrentRecommendationsMap, readRoundAllocations } from "@merit/recommendations/scope";
import { readReviewsByCasesMap } from "@merit/reviews/scope";
import { fundingRounds } from "@merit/rounds/schema";
import {
  assembleRoundRecord,
  managerNeedsReassignment,
  readCriteriaVersionsMap,
  toMoneyData,
} from "@merit/rounds/scope";

import { assembleApplicationRecord } from "../projections";

// Compose the overview in one authorized database snapshot; neither root stores this view.
export const readPublicRound = async (
  db: Database,
  userId: string,
  input: { workspaceSlug: string; publicId: string },
) => {
  const workspace = authorizedWorkspaces(db, userId, "work_on_grants", input.workspaceSlug);
  const [row] = await db
    .select({
      round: fundingRounds,
      foundation: workspace.name,
      organizationId: fundingRounds.organizationId,
      revision: fundingRounds.revision,
      managerNeedsReassignment,
      workspaceSlug: workspace.slug,
    })
    .from(fundingRounds)
    .innerJoin(workspace, eq(workspace.id, fundingRounds.organizationId))
    .where(eq(fundingRounds.id, input.publicId));
  if (!row) {
    return null;
  }

  const historyMap = await readCriteriaVersionsMap(db, [row.round.id]);
  const record = assembleRoundRecord(row.round, row.foundation, historyMap.get(row.round.id) ?? []);

  return {
    organizationId: row.organizationId,
    revision: row.revision,
    snapshot: {
      ...record,
      managerNeedsReassignment: row.managerNeedsReassignment,
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
  const workspace = authorizedWorkspaces(db, userId, "work_on_grants", input.workspaceSlug);
  const [row] = await db
    .select({
      caseRow: applicationCases,
      roundRow: fundingRounds,
      foundation: workspace.name,
      withdrawnApplications: roundWithdrawnCount(fundingRounds),
      workspaceSlug: workspace.slug,
    })
    .from(applicationCases)
    .innerJoin(
      fundingRounds,
      and(
        eq(fundingRounds.organizationId, applicationCases.organizationId),
        eq(fundingRounds.id, applicationCases.roundId),
      ),
    )
    .innerJoin(workspace, eq(workspace.id, applicationCases.organizationId))
    .where(eq(applicationCases.id, input.publicId));
  if (!row) {
    return null;
  }

  const [
    historyMap,
    intakeMap,
    reviewsMap,
    recommendationsMap,
    allocations,
    workingRevisionsMap,
    versionRows,
  ] = await Promise.all([
    readCriteriaVersionsMap(db, [row.roundRow.id]),
    readIntakeApplicationsMap(db, row.caseRow.organizationId, [row.caseRow]),
    readReviewsByCasesMap(db, [row.caseRow.id]),
    readCurrentRecommendationsMap(db, [row.caseRow.id]),
    readRoundAllocations(db, row.caseRow.organizationId, row.roundRow.id),
    readWorkingRevisionsMap(db, [row.caseRow.id]),
    db
      .select({ version: materialVersions.version })
      .from(materialVersions)
      .where(eq(materialVersions.caseId, row.caseRow.id))
      .orderBy(asc(materialVersions.version)),
  ]);

  const intake = intakeMap.get(row.caseRow.id);
  if (!intake) {
    return null;
  }
  const recommendation = recommendationsMap.get(row.caseRow.id);

  return {
    application: assembleApplicationRecord(intake, reviewsMap.get(row.caseRow.id), recommendation),
    organizationId: row.caseRow.organizationId,
    round: assembleRoundRecord(row.roundRow, row.foundation, historyMap.get(row.roundRow.id) ?? []),
    allocations,
    withdrawnApplications: row.withdrawnApplications,
    workspaceSlug: row.workspaceSlug,
    publicId: row.caseRow.id,
    recommendationVersion: recommendation?.revision ?? 0,
    intakeRevision: row.caseRow.revision,
    materialVersions: versionRows.map((v) => v.version),
    workingRevision: workingRevisionsMap.get(row.caseRow.id) ?? null,
  };
};

export const listRoundSummaries = async (db: Database, userId: string, workspaceSlug: string) => {
  const workspace = authorizedWorkspaces(db, userId, "read_workspace", workspaceSlug);

  const rows = await db
    .select({
      canWorkOnGrants: workspace.canWorkOnGrants,
      organizationId: workspace.id,
      organizationName: workspace.name,
      workspaceSlug: workspace.slug,
      publicId: fundingRounds.id,
      title: fundingRounds.title,
      decisionStatus: fundingRounds.decisionStatus,
      manager: fundingRounds.managerName,
      managerNeedsReassignment,
      meetingDate: fundingRounds.meetingDate,
      budgetMinorUnits: fundingRounds.budgetMinorUnits,
      currency: fundingRounds.currency,
      applicationCount: sql<number>`(select count(*)::integer from ${applicationCases} where ${applicationCases.organizationId} = ${fundingRounds.organizationId} and ${applicationCases.roundId} = ${fundingRounds.id})`,
    })
    .from(workspace)
    .leftJoin(
      fundingRounds,
      and(eq(fundingRounds.organizationId, workspace.id), workspace.canWorkOnGrants),
    )
    .orderBy(workspace.name, fundingRounds.title, fundingRounds.id);

  return rows.map(({ budgetMinorUnits, currency, ...rest }) => ({
    ...rest,
    budget: rest.publicId === null ? null : toMoneyData(budgetMinorUnits, currency ?? "EUR"),
  }));
};
