import { and, eq, inArray, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { currentMaterial } from "@merit/applications/scope";
import type { Database } from "@merit/db";
import { fundingRounds } from "@merit/rounds/schema";

type Target = { targetType: string; targetId: string; applicationId: string | null };

/** Current identities for the records an activity page points at. */
export const readActivityRecords = async (
  db: Database,
  organizationId: string,
  targets: Target[],
) => {
  const ids = (...types: string[]) => [
    ...new Set(targets.filter((t) => types.includes(t.targetType)).map((t) => t.targetId)),
  ];

  const applicationIds = [
    ...new Set(targets.flatMap((target) => (target.applicationId ? [target.applicationId] : []))),
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
  };
};
