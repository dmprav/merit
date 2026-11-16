import type { IntakeState } from "@merit/applications/api";
import { workingRevisionSchema, materialVersionSchema } from "@merit/applications/domain";
import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";
import { decodeMoney, subtract } from "@merit/money";
import { workspaceSlugSchema } from "@merit/organizations/api";
import { reviewProgress } from "@merit/reviews/domain";
import type { PreparationState } from "@merit/rounds/api";
import { decodeRound } from "@merit/rounds/domain";
import { readManagerCandidates } from "@merit/rounds/readers";

import {
  applicationRequestSchema,
  type ApplicationRequest,
  publicRoundRequestSchema,
  type PublicRoundRequest,
  decodeRoundSummary,
} from "../../api/queries";
import { decodeApplicationContext } from "../../api/queries/application-detail";
import { applicationView } from "../../api/queries/round-view";
import { decodeApplication } from "../../domain/encoding";
import { readRoundTotals } from "../persistence/queries/application-overview";
import {
  readApplicationDetail,
  readPublicRound,
  listRoundSummaries,
} from "../persistence/queries/pages";
import { readApplicationHistory, readRoundHistory } from "./history-records";

export const listFundingRounds = async (db: Database, actor: Actor, workspaceSlug: string) => {
  return readTransaction(db, async (tx) => {
    const parsed = workspaceSlugSchema.safeParse(workspaceSlug);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const rows = await listRoundSummaries(tx, actor.userId, parsed.data);
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
    const parsed = publicRoundRequestSchema.safeParse(input);
    if (!parsed.success) {
      return null;
    }
    const row = await readPublicRound(tx, actor.userId, parsed.data);
    if (!row) {
      return null;
    }

    const properties = decodeRound(row.snapshot);
    const totals = await readRoundTotals(tx, actor.userId, row.workspaceSlug, properties.id);
    const proposed = decodeMoney({ minorUnits: totals.proposed, currency: "EUR" });
    const round = {
      ...properties,
      applicationCount: totals.applicationCount,
      criteriaImpact: totals.criteriaImpact,
      totals: {
        requested: decodeMoney({ minorUnits: totals.requested, currency: "EUR" }),
        proposed,
        remaining: properties.budget === null ? null : subtract(properties.budget, proposed),
        unknownRequests: totals.unknownRequests,
        withdrawnApplications: totals.withdrawnApplications,
        reviews: { ...totals.reviews, ...reviewProgress(totals.reviews) },
      },
    };
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
    const parsed = applicationRequestSchema.safeParse(input);
    if (!parsed.success) {
      return null;
    }
    const row = await readApplicationDetail(tx, actor.userId, parsed.data);
    if (!row) {
      return null;
    }

    const history = await readApplicationHistory(tx, row.organizationId, row.publicId);
    const round = decodeApplicationContext(row.round, row.allocations, row.withdrawnApplications);

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
