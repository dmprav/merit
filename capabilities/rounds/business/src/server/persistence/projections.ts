import { sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { accessScope } from "@merit/access/scope";
import { appUsers } from "@merit/auth/schema";
import { memberships, organizations } from "@merit/organizations/schema";

import { fundingRounds, criteriaVersions } from "./schema";

const moneyData = (minorUnits: ReturnType<typeof sql>) =>
  sql<unknown>`case when ${minorUnits} is null then null else jsonb_build_object('minorUnits', (${minorUnits})::text, 'currency', 'EUR') end`;

export const currentCriteria = sql<unknown>`(select ${criteriaVersions.criteria} from ${criteriaVersions}
  where ${criteriaVersions.roundPublicId} = ${fundingRounds.id}
    and ${criteriaVersions.version} = ${fundingRounds.criteriaVersion})`;

export const criteriaHistory = sql<unknown>`(select coalesce(jsonb_agg(jsonb_build_object('version', ${criteriaVersions.version}, 'criteria', ${criteriaVersions.criteria}) order by ${criteriaVersions.version}), '[]'::jsonb)
  from ${criteriaVersions} where ${criteriaVersions.roundPublicId} = ${fundingRounds.id})`;

export const roundRecord = sql<unknown>`jsonb_build_object(
  'id', ${fundingRounds.id}, 'title', ${fundingRounds.title},
  'foundation', (select ${organizations.name} from ${organizations} where ${organizations.id} = ${fundingRounds.organizationId}),
  'purpose', ${fundingRounds.purpose}, 'manager', ${fundingRounds.managerName}, 'managerUserId', ${fundingRounds.managerUserId},
  'currency', ${fundingRounds.currency}, 'budget', ${moneyData(sql`${fundingRounds.budget}`)},
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
