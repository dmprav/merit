import { and, eq, inArray, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { currentMaterial } from "@merit/applications/scope";
import type { Database } from "@merit/db";
import { assessments } from "@merit/reviews/schema";
import { fundingRounds } from "@merit/rounds/schema";

/** Records whose events belong to a round: the round, its applications, and their
 * assessments and recommendations (recommendations are identified by application). */
export const readRoundActivityTargets = async (
  db: Database,
  organizationId: string,
  roundId: string,
) => {
  // A deleted round belongs to no round filter, like its deleted applications.
  const [round] = await db
    .select({ id: fundingRounds.id })
    .from(fundingRounds)
    .where(and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, roundId)));
  const applications = (
    await db
      .select({ id: applicationCases.id })
      .from(applicationCases)
      .where(
        and(
          eq(applicationCases.organizationId, organizationId),
          eq(applicationCases.roundId, roundId),
        ),
      )
  ).map((row) => row.id);
  const reviewed =
    applications.length === 0
      ? []
      : (
          await db
            .select({ id: assessments.id })
            .from(assessments)
            .where(
              and(
                eq(assessments.organizationId, organizationId),
                inArray(assessments.caseId, applications),
              ),
            )
        ).map((row) => row.id);

  return [
    { type: "round", ids: round ? [roundId] : [] },
    { type: "application", ids: applications },
    { type: "assessment", ids: reviewed },
    { type: "recommendation", ids: applications },
  ];
};

type Target = { targetType: string; targetId: string };

/** Current identities for the records an activity page points at. */
export const readActivityRecords = async (
  db: Database,
  organizationId: string,
  targets: Target[],
) => {
  const ids = (...types: string[]) => [
    ...new Set(targets.filter((t) => types.includes(t.targetType)).map((t) => t.targetId)),
  ];

  const assessmentIds = ids("assessment");
  const assessmentCases =
    assessmentIds.length === 0
      ? []
      : await db
          .select({ id: assessments.id, caseId: assessments.caseId })
          .from(assessments)
          .where(
            and(
              eq(assessments.organizationId, organizationId),
              inArray(assessments.id, assessmentIds),
            ),
          );
  const applicationIds = [
    ...new Set([...ids("application", "recommendation"), ...assessmentCases.map((a) => a.caseId)]),
  ];
  const roundIds = ids("round");

  const applications =
    applicationIds.length === 0
      ? []
      : await db
          .select({ id: applicationCases.id, title: sql<string>`(${currentMaterial})->>'title'` })
          .from(applicationCases)
          .where(
            and(
              eq(applicationCases.organizationId, organizationId),
              inArray(applicationCases.id, applicationIds),
            ),
          );
  const rounds =
    roundIds.length === 0
      ? []
      : await db
          .select({ id: fundingRounds.id, title: fundingRounds.title })
          .from(fundingRounds)
          .where(
            and(
              eq(fundingRounds.organizationId, organizationId),
              inArray(fundingRounds.id, roundIds),
            ),
          );

  return {
    applications: new Map(applications.map((row) => [row.id, row.title])),
    rounds: new Map(rounds.map((row) => [row.id, row.title])),
    assessmentCases: new Map(assessmentCases.map((row) => [row.id, row.caseId])),
  };
};
