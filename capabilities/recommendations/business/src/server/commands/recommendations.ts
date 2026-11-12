import { lockApplicationCase } from "@merit/applications/locks";
import { actorProvenance, type Actor, type Provenance } from "@merit/auth";
import type { Database } from "@merit/db";

import {
  saveRecommendationRequestSchema,
  type SaveRecommendationRequest,
} from "../../api/commands";
import { decodeRecommendation } from "../../api/encoding";
import { prepareRecommendation } from "../../domain/recommendation";
import {
  readRecommendationState,
  writeRecommendation,
} from "../persistence/commands/recommendations";

/** Append in the supplied transaction; failure must roll back the recommendation. */
export type RecordRecommendationAudit = (
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  event: {
    organizationId: string;
    actor: { userId: string; name: string | null; provenance: Provenance };
    action: "recommendation.saved";
    target: { type: "recommendation"; id: string; revision: number };
  },
) => Promise<void>;

export const saveFundingRecommendation = async (
  db: Database,
  actor: Actor,
  input: SaveRecommendationRequest,
  recordAuditEvent: RecordRecommendationAudit,
) => {
  const request = saveRecommendationRequestSchema.parse(input);

  return db.transaction(async (tx) => {
    const identity = await lockApplicationCase(tx, actor.userId, request, "update");
    if (!identity) {
      return { status: "not_found" } as const;
    }

    const row = await readRecommendationState(tx, actor.userId, request);
    if (!row) {
      return { status: "not_found" } as const;
    }

    const { application, round } = row;
    if (
      row.recommendationVersion !== request.expectedRevision ||
      application.version !== request.expectedApplicationVersion
    ) {
      return { status: "conflict" } as const;
    }

    let recommendation;
    try {
      recommendation = decodeRecommendation(request.recommendation);
    } catch {
      return { status: "invalid", error: "invalid_recommendation" } as const;
    }

    const result = prepareRecommendation(
      round,
      application,
      recommendation,
      new Date().toISOString().slice(0, 10),
    );
    if (!result.ok) {
      return { status: "invalid", error: result.error } as const;
    }

    result.recommendation.author = {
      provenance: actorProvenance(actor),
      userId: identity.actor.userId,
      name: identity.actor.name ?? "",
    };

    const saved = await writeRecommendation(tx, {
      publicId: request.publicId,
      expectedRevision: request.expectedRevision,
      actorUserId: identity.actor.userId,
      provenance: actorProvenance(actor),
      after: result.recommendation,
    });
    if (!saved) {
      return { status: "conflict" } as const;
    }

    await recordAuditEvent(tx, {
      organizationId: identity.organizationId,
      actor: {
        userId: identity.actor.userId,
        name: identity.actor.name,
        provenance: actorProvenance(actor),
      },
      action: "recommendation.saved",
      target: {
        type: "recommendation",
        id: request.publicId,
        revision: row.recommendationVersion + 1,
      },
    });

    return {
      status: "ok",
      recommendation: result.recommendation,
      recommendationVersion: row.recommendationVersion + 1,
      budget: round.budget,
      totals: result.totals,
    } as const;
  });
};
