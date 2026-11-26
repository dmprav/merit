import { sql } from "drizzle-orm";

import type { ApplicationDecisionWork } from "@merit/applications/server/grant-work";
import type { RoundCommitments } from "@merit/rounds/server/grant-work";

import { commitmentTotals } from "../../../domain/commitment";
import { decodeCommitments } from "../../../domain/encoding";
import { hasDecision, readRoundCommitments } from "../projections";
import { committeeDecisionVersions } from "../schema";

/** Decision work that Applications consults under its held round and case locks. */
export const applicationDecisionWork: ApplicationDecisionWork = {
  hasDecision: async (tx, caseId) => {
    const { rows } = await tx.execute<{ decided: boolean }>(
      sql`select ${hasDecision(caseId)} as decided`,
    );
    return rows[0]?.decided === true;
  },
  hasCommitment: async (tx, caseId) => {
    const { rows } = await tx.execute<{ committed: boolean }>(sql`select exists (
      select 1 from ${committeeDecisionVersions} d
      where d.case_id = ${caseId}
        and d.revision = (select max(l.revision) from ${committeeDecisionVersions} l where l.case_id = d.case_id)
        and d.outcome in ('Fund', 'Fund with conditions')
    ) as committed`);
    return rows[0]?.committed === true;
  },
};

/** The round's committed total, which Rounds consults under its held round lock. */
export const roundCommitments: RoundCommitments = async (tx, organizationId, roundId) =>
  commitmentTotals(null, decodeCommitments(await readRoundCommitments(tx, organizationId, roundId)))
    .committed;
