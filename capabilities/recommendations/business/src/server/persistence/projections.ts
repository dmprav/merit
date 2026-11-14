import { sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { activeCase } from "@merit/applications/scope";
import { fundingRounds } from "@merit/rounds/schema";

import { recommendationVersions } from "./schema";

export const recommendationRevision = sql<number>`coalesce((select max(r.revision) from ${recommendationVersions} r where r.case_id = ${applicationCases.id}), 0)`;
export const currentRecommendation = sql<unknown>`(select r.content from ${recommendationVersions} r where r.case_id = ${applicationCases.id} order by r.revision desc limit 1)`;
export const roundAllocations = sql<unknown>`(select coalesce(jsonb_agg(r.content->'allocation'), '[]'::jsonb)
 from ${applicationCases} sibling join ${recommendationVersions} r on r.case_id = sibling.id
 and r.revision = (select max(v.revision) from ${recommendationVersions} v where v.case_id = sibling.id)
 where sibling.organization_id = ${fundingRounds.organizationId} and sibling.round_id = ${fundingRounds.id}
   and ${activeCase("sibling")})`;
