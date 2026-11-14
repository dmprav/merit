import { and, eq, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import {
  applicationSearchApplicant,
  applicationSearchMatch,
  applicationSearchRank,
  applicationSearchTitle,
  applicationSearchTitleOrder,
  caseWithdrawn,
} from "@merit/applications/scope";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import type { SearchTerms } from "@merit/db/search";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";
import { fundingRounds } from "@merit/rounds/schema";
import { roundSearchMatch, roundSearchRank, roundSearchTitleOrder } from "@merit/rounds/scope";

// Counted over the rows that already passed access and matching, before the limit applies.
const total = sql<number>`(count(*) over ())::integer`;

/**
 * The best matches in each group. Workspace access sits in every `WHERE`, ahead of counting,
 * ordering, and limiting, so a non-member's query touches no rows.
 */
export const readWorkspaceSearch = async (
  db: Database,
  userId: string,
  workspaceSlug: string,
  terms: SearchTerms,
  limits: { rounds: number; applications: number },
) => {
  const access = and(
    eq(organizations.slug, workspaceSlug),
    organizationScope(userId, "work_on_grants", organizations.id),
  );

  const rounds = await db
    .select({
      id: fundingRounds.id,
      title: fundingRounds.title,
      meetingDate: fundingRounds.meetingDate,
      rank: roundSearchRank(terms),
      total,
    })
    .from(fundingRounds)
    .innerJoin(organizations, eq(organizations.id, fundingRounds.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(and(access, roundSearchMatch(terms)))
    .orderBy(sql`${roundSearchRank(terms)}`, roundSearchTitleOrder, fundingRounds.id)
    .limit(limits.rounds);

  const applications = await db
    .select({
      id: applicationCases.id,
      title: applicationSearchTitle,
      applicant: applicationSearchApplicant,
      roundId: fundingRounds.id,
      roundTitle: fundingRounds.title,
      intakeStatus: applicationCases.intakeStatus,
      withdrawn: caseWithdrawn,
      rank: applicationSearchRank(terms),
      total,
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
    .where(and(access, applicationSearchMatch(terms)))
    .orderBy(
      sql`${applicationSearchRank(terms)}`,
      caseWithdrawn,
      applicationSearchTitleOrder,
      applicationCases.id,
    )
    .limit(limits.applications);

  return { rounds, applications };
};
