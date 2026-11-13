import { workingRevisionSchema, materialVersionSchema } from "@merit/applications/domain";
import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";
import { workspaceSlugSchema } from "@merit/organizations/api";
import { readManagerCandidates } from "@merit/rounds/readers";

import {
  applicationRequestSchema,
  type ApplicationRequest,
  publicRoundRequestSchema,
  type PublicRoundRequest,
  decodeRoundSummary,
} from "../../api/queries";
import { decodeApplicationContext } from "../../api/queries/application-detail";
import type { IntakeState, PreparationState } from "../../api/queries/editing-state";
import { roundView } from "../../api/queries/round-view";
import { applicationView } from "../../api/queries/round-view";
import { decodeApplication, decodeRoundOverview } from "../persistence/encoding";
import {
  readApplicationDetail,
  readPublicRound,
  listRoundSummaries,
} from "../persistence/queries/pages";
import { readApplicationHistory, readRoundHistory } from "./history-records";

export const listFundingRounds = async (db: Database, actor: Actor, workspaceSlug: string) => {
  return readTransaction(db, async (tx) => {
    const rows = await listRoundSummaries(
      tx,
      actor.userId,
      workspaceSlugSchema.parse(workspaceSlug),
    );
    if (!rows[0]) {
      return { status: "not_found" } as const;
    }
    if (!rows[0].canWorkOnGrants) {
      return { status: "forbidden" } as const;
    }
    return {
      status: "ok",
      rounds: rows.filter((row) => row.publicId !== null).map(decodeRoundSummary),
    } as const;
  });
};

// Browser page composition includes routing and editing context; bounded task reads live in reading.ts.
export const getFundingRoundPage = async (
  db: Database,
  actor: Actor,
  input: PublicRoundRequest,
) => {
  return readTransaction(db, async (tx) => {
    const request = publicRoundRequestSchema.parse(input);
    const row = await readPublicRound(tx, actor.userId, request);
    if (!row) {
      return null;
    }

    const round = roundView(decodeRoundOverview(row.snapshot));
    const [managers, history] = await Promise.all([
      readManagerCandidates(tx, row.organizationId),
      readRoundHistory(tx, row.organizationId, round.id),
    ]);

    return {
      round,
      workspaceSlug: row.workspaceSlug,
      preparation: {
        revision: row.revision,
        managers,
        budgetHistory: history.entries,
      } satisfies PreparationState,
    };
  });
};

export const getFundingApplicationPage = async (
  db: Database,
  actor: Actor,
  input: ApplicationRequest,
) => {
  return readTransaction(db, async (tx) => {
    const request = applicationRequestSchema.parse(input);
    const row = await readApplicationDetail(tx, actor.userId, request);
    if (!row) {
      return null;
    }

    const history = await readApplicationHistory(tx, row.organizationId, row.publicId);
    const round = decodeApplicationContext(row.round, row.allocations);

    return {
      intake: {
        materialVersions: row.materialVersions.map((version) =>
          materialVersionSchema.parse(version),
        ),
        revision: row.intakeRevision,
        workingRevision:
          row.workingRevision === null ? null : workingRevisionSchema.parse(row.workingRevision),
        history: history.entries,
      } satisfies IntakeState,
      application: applicationView(
        decodeApplication(row.application),
        round.criteria,
        round.criteriaVersion,
      ),
      round,
      workspaceSlug: row.workspaceSlug,
      recommendationVersion: row.recommendationVersion,
    };
  });
};
