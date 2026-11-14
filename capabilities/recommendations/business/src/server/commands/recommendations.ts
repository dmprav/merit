import { lockApplicationCase } from "@merit/applications/locks";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { compare } from "@merit/money";

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

export const saveFundingRecommendation = async (
  db: Database,
  actor: Actor,
  input: SaveRecommendationRequest,
) => {
  const parsed = saveRecommendationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_recommendation" } as const;
  }

  const request = parsed.data;

  return db.transaction(async (tx) => {
    const identity = await lockApplicationCase(tx, actor.userId, request, "update");
    if (!identity) {
      return { status: "not_found" } as const;
    }

    const row = await readRecommendationState(tx, identity.organizationId, request.publicId);
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

    const previous = application.managerRecommendation;
    const next = result.recommendation;
    const unchanged = sameRecommendation(previous, next);
    if (previous && unchanged) {
      return {
        status: "ok",
        recommendation: previous,
        recommendationVersion: row.recommendationVersion,
        budget: round.budget,
        totals: result.totals,
      } as const;
    }

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

    await recordRecommendationEvent(tx, { identity, actor, row, request, next });

    return {
      status: "ok",
      recommendation: result.recommendation,
      recommendationVersion: row.recommendationVersion + 1,
      budget: round.budget,
      totals: result.totals,
    } as const;
  });
};

const recordRecommendationEvent = async (
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  {
    identity,
    actor,
    row,
    request,
    next,
  }: {
    identity: NonNullable<Awaited<ReturnType<typeof lockApplicationCase>>>;
    actor: Actor;
    row: NonNullable<Awaited<ReturnType<typeof readRecommendationState>>>;
    request: SaveRecommendationRequest;
    next: NonNullable<
      Awaited<ReturnType<typeof readRecommendationState>>
    >["application"]["managerRecommendation"];
  },
) => {
  await recordAuditEvent(tx, {
    organizationId: identity.organizationId,
    actor: {
      userId: identity.actor.userId,
      name: identity.actor.name,
      provenance: actorProvenance(actor),
    },
    action: "recommendation.recorded",
    target: {
      type: "recommendation",
      id: request.publicId,
      revision: row.recommendationVersion + 1,
      name: row.title,
    },
    context: { roundId: row.roundId, applicationId: request.publicId },
    details: { applicationVersion: next?.recorded?.applicationVersion ?? null },
  });
};

type Recommendation = NonNullable<
  Awaited<ReturnType<typeof readRecommendationState>>
>["application"]["managerRecommendation"];

const sameRecommendation = (previous: Recommendation, next: NonNullable<Recommendation>) =>
  previous &&
  previous.position === next.position &&
  previous.reasoning === next.reasoning &&
  compare(previous.allocation, next.allocation) === 0 &&
  previous.recorded?.applicationVersion === next.recorded?.applicationVersion &&
  previous.author?.userId === next.author?.userId;
