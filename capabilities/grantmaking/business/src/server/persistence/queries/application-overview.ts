import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import { caseWithdrawn } from "@merit/applications/scope";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";
import { readCurrentRecommendationsMap } from "@merit/recommendations/scope";
import { assessments, assessmentVersions, reviewRequests } from "@merit/reviews/schema";
import { fundingRounds } from "@merit/rounds/schema";
import {
  criteriaVersionKey,
  readCriteriaByVersionsMap,
  type CriterionRecord,
} from "@merit/rounds/scope";

type CriteriaMap = Map<string, CriterionRecord[]>;

const assessmentBasisKey = (caseId: string, assessmentId: string) => `${caseId}:${assessmentId}`;

const collectBasisPairs = (
  rows: { roundId: string; criteriaVersion: number }[],
  latestVersions: { criteriaRoundPublicId: string | null; criteriaVersion: number | null }[],
  outstanding: { criteriaRoundPublicId: string; criteriaVersion: number }[],
) => {
  const pairs: { roundId: string; version: number }[] = rows.map((row) => ({
    roundId: row.roundId,
    version: row.criteriaVersion,
  }));
  for (const v of latestVersions) {
    if (v.criteriaRoundPublicId !== null && v.criteriaVersion !== null) {
      pairs.push({ roundId: v.criteriaRoundPublicId, version: v.criteriaVersion });
    }
  }
  for (const r of outstanding) {
    pairs.push({ roundId: r.criteriaRoundPublicId, version: r.criteriaVersion });
  }
  return pairs;
};

const groupReviewBases = (
  latestAssessments: {
    caseId: string;
    applicationVersion: number | null;
    criteriaRoundPublicId: string | null;
    criteriaVersion: number | null;
  }[],
  outstandingRequests: {
    caseId: string;
    criteriaRoundPublicId: string;
    criteriaVersion: number;
  }[],
  criteriaMap: CriteriaMap,
) => {
  const basesByCase = new Map<
    string,
    {
      submission: { applicationVersion: number | null } | null;
      criteria: CriterionRecord[] | null;
    }[]
  >();
  for (const item of latestAssessments) {
    const list = basesByCase.get(item.caseId) ?? [];
    list.push({
      submission: { applicationVersion: item.applicationVersion },
      criteria:
        item.criteriaRoundPublicId !== null && item.criteriaVersion !== null
          ? (criteriaMap.get(
              criteriaVersionKey(item.criteriaRoundPublicId, item.criteriaVersion),
            ) ?? null)
          : null,
    });
    basesByCase.set(item.caseId, list);
  }
  for (const request of outstandingRequests) {
    const list = basesByCase.get(request.caseId) ?? [];
    list.push({
      submission: null,
      criteria:
        criteriaMap.get(
          criteriaVersionKey(request.criteriaRoundPublicId, request.criteriaVersion),
        ) ?? null,
    });
    basesByCase.set(request.caseId, list);
  }
  return basesByCase;
};

const readOverviewApplications = (db: Database, userId: string, workspaceSlug: string) =>
  db
    .select({
      id: applicationCases.id,
      title: materialVersions.title,
      applicant: sql<string | null>`nullif(${materialVersions.applicantOrganization}, '')`,
      version: applicationCases.materialVersion,
      intakeStatus: applicationCases.intakeStatus,
      withdrawn: caseWithdrawn,
      roundId: fundingRounds.id,
      roundTitle: fundingRounds.title,
      criteriaVersion: fundingRounds.criteriaVersion,
    })
    .from(applicationCases)
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
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
        eq(organizations.slug, workspaceSlug),
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    )
    .orderBy(fundingRounds.title, fundingRounds.id, applicationCases.position, applicationCases.id);

type OverviewApplicationRow = Awaited<ReturnType<typeof readOverviewApplications>>[number];

const readOverviewContext = async (db: Database, rows: OverviewApplicationRow[]) => {
  const caseIds = rows.map((row) => row.id);
  const [assessmentRows, versionRows, outstandingRequests, recommendationsMap] = await Promise.all([
    db
      .select({
        caseId: assessments.caseId,
        id: assessments.id,
        previousId: assessments.previousId,
      })
      .from(assessments)
      .where(inArray(assessments.caseId, caseIds)),
    db
      .select({
        caseId: assessmentVersions.caseId,
        assessmentId: assessmentVersions.assessmentId,
        applicationVersion: assessmentVersions.applicationVersion,
        criteriaRoundPublicId: assessmentVersions.criteriaRoundPublicId,
        criteriaVersion: assessmentVersions.criteriaVersion,
      })
      .from(assessmentVersions)
      .where(inArray(assessmentVersions.caseId, caseIds))
      .orderBy(desc(assessmentVersions.version)),
    db
      .select({
        caseId: reviewRequests.caseId,
        criteriaRoundPublicId: reviewRequests.criteriaRoundPublicId,
        criteriaVersion: reviewRequests.criteriaVersion,
      })
      .from(reviewRequests)
      .where(
        and(inArray(reviewRequests.caseId, caseIds), eq(reviewRequests.status, "outstanding")),
      ),
    readCurrentRecommendationsMap(db, caseIds),
  ]);

  const superseded = new Set(
    assessmentRows.flatMap((row) =>
      row.previousId ? [assessmentBasisKey(row.caseId, row.previousId)] : [],
    ),
  );
  const latestVersionByAssessment = new Map<string, (typeof versionRows)[number]>();
  for (const version of versionRows) {
    const key = assessmentBasisKey(version.caseId, version.assessmentId);
    if (!superseded.has(key) && !latestVersionByAssessment.has(key)) {
      latestVersionByAssessment.set(key, version);
    }
  }
  const latestAssessments = [...latestVersionByAssessment.values()];
  const criteriaMap = await readCriteriaByVersionsMap(
    db,
    collectBasisPairs(rows, latestAssessments, outstandingRequests),
  );
  return {
    criteriaMap,
    recommendationsMap,
    reviewBasesByCase: groupReviewBases(latestAssessments, outstandingRequests, criteriaMap),
  };
};

export const readApplicationOverviews = async (
  db: Database,
  userId: string,
  workspaceSlug: string,
) => {
  const rows = await readOverviewApplications(db, userId, workspaceSlug);
  if (rows.length === 0) {
    return [];
  }

  const { criteriaMap, recommendationsMap, reviewBasesByCase } = await readOverviewContext(
    db,
    rows,
  );
  return rows.map((row) => {
    const recommendation = recommendationsMap.get(row.id)?.recommendation;
    return {
      id: row.id,
      title: row.title,
      applicant: row.applicant,
      version: row.version,
      intakeStatus: row.intakeStatus,
      withdrawn: row.withdrawn,
      roundId: row.roundId,
      roundTitle: row.roundTitle,
      criteria: criteriaMap.get(criteriaVersionKey(row.roundId, row.criteriaVersion)) ?? [],
      reviewBases: reviewBasesByCase.get(row.id) ?? [],
      recommendation: recommendation
        ? {
            position: recommendation.position,
            outdated: recommendation.recorded
              ? recommendation.recorded.applicationVersion !== row.version
              : false,
          }
        : null,
    };
  });
};
