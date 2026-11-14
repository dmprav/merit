import { sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { accessScope } from "@merit/access/scope";
import { appUsers } from "@merit/auth/schema";
import { containsEveryWord, matchRank, titleOrder, type SearchTerms } from "@merit/db/search";
import { memberships, organizations } from "@merit/organizations/schema";

import { fundingRounds, criteriaVersions } from "./schema";

const moneyData = (minorUnits: ReturnType<typeof sql>, currency: ReturnType<typeof sql>) =>
  sql<unknown>`case when ${minorUnits} is null then null else jsonb_build_object('minorUnits', (${minorUnits})::text, 'currency', ${currency}) end`;

export const currentCriteria = sql<unknown>`(select ${criteriaVersions.criteria} from ${criteriaVersions}
  where ${criteriaVersions.roundPublicId} = ${fundingRounds.id}
    and ${criteriaVersions.version} = ${fundingRounds.criteriaVersion})`;

export const criteriaHistory = sql<unknown>`(select coalesce(jsonb_agg(jsonb_build_object('version', ${criteriaVersions.version}, 'criteria', ${criteriaVersions.criteria}) order by ${criteriaVersions.version}), '[]'::jsonb)
  from ${criteriaVersions} where ${criteriaVersions.roundPublicId} = ${fundingRounds.id})`;

export const roundRecord = sql<unknown>`jsonb_build_object(
  'id', ${fundingRounds.id}, 'title', ${fundingRounds.title},
  'foundation', (select ${organizations.name} from ${organizations} where ${organizations.id} = ${fundingRounds.organizationId}),
  'purpose', ${fundingRounds.purpose}, 'manager', ${fundingRounds.managerName}, 'managerUserId', ${fundingRounds.managerUserId},
  'currency', ${fundingRounds.currency}, 'budget', ${moneyData(sql`${fundingRounds.budget}`, sql`${fundingRounds.currency}`)},
  'meetingDate', ${fundingRounds.meetingDate}, 'snapshotDate', ${fundingRounds.snapshotDate},
  'decisionStatus', ${fundingRounds.decisionStatus}, 'criteria', ${currentCriteria},
  'criteriaVersion', ${fundingRounds.criteriaVersion}, 'criteriaHistory', ${criteriaHistory})`;

const responsible = alias(memberships, "responsible");
const person = alias(appUsers, "person");
export const managerNeedsReassignment = sql<boolean>`NOT EXISTS (
  SELECT 1 FROM ${memberships} AS responsible
  JOIN ${appUsers} AS person ON ${person.id} = ${responsible.userId}
  WHERE ${responsible.userId} = ${fundingRounds.managerUserId}
    AND ${accessScope("work_on_grants", {
      "subject.active": person.active,
      "subject.organizationId": responsible.organizationId,
      "subject.role": responsible.role,
      "subject.administration": responsible.administration,
      "resource.organizationId": fundingRounds.organizationId,
    })}
)`;

// The round title is searched where it is stored, so renaming a round updates search with no
// extra writes. The index covers this exact expression.
const searchTitle = sql`${fundingRounds.title}`;

/** Whether every word appears in the round's title. */
export const roundSearchMatch = (terms: SearchTerms) => containsEveryWord(searchTitle, terms);

/** Orders rounds by title the way people read it. */
export const roundSearchTitleOrder = titleOrder(searchTitle);

/** 0 when the title equals the whole query, 1 when it starts with it, 2 otherwise. */
export const roundSearchRank = (terms: SearchTerms) => matchRank([searchTitle], terms);
