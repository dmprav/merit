import { lockApplicationCase, type LockedApplicationCase } from "@merit/applications/locks";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import type { Database, Transaction } from "@merit/db";
import { compare } from "@merit/money";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";
import { writeObservedWorkspace } from "@merit/organizations/transactions";

import {
  saveRecommendationRequestSchema,
  type SaveRecommendationRequest,
} from "../../api/commands";
import { decodeRecommendation } from "../../domain/encoding";
import { prepareRecommendation } from "../../domain/recommendation";
import {
  readRecommendationState,
  writeRecommendation,
} from "../persistence/commands/recommendations";

export type IsCurrentAssessment = (
  locked: LockedApplicationCase,
  expected: NonNullable<SaveRecommendationRequest["expectedCurrentAssessment"]>,
) => Promise<boolean>;

const decodeOrNull = (input: SaveRecommendationRequest["recommendation"]) => {
  try {
    return decodeRecommendation(input);
  } catch {
    return null;
  }
};

export const saveFundingRecommendation = async (
  db: Database,
  actor: Actor,
  input: SaveRecommendationRequest,
  isCurrentAssessment: IsCurrentAssessment,
  onCommitted?: WorkspaceChangeObserver,
) => {
  const parsed = saveRecommendationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_recommendation" } as const;
  }

  const request = parsed.data;

  return writeObservedWorkspace(db, actor, request, onCommitted, async (tx, changed) => {
    const identity = await lockApplicationCase(tx, actor.userId, request, "update");
    if (!identity) {
      return { status: "not_found" } as const;
    }

    if (identity.withdrawn) {
      return { status: "invalid", error: "application_withdrawn" } as const;
    }

    const row = await readRecommendationState(tx, identity.organizationId, request.publicId);
    if (!row) {
      return { status: "not_found" } as const;
    }

    const { application, round } = row;
    if (
      row.recommendationVersion !== request.expectedRevision ||
      application.version !== request.expectedApplicationVersion ||
      (request.expectedCurrentAssessment &&
        !(await isCurrentAssessment(identity, request.expectedCurrentAssessment)))
    ) {
      return { status: "conflict" } as const;
    }

    const recommendation = decodeOrNull(request.recommendation);
    if (!recommendation) {
      return { status: "invalid", error: "invalid_recommendation" } as const;
    }

    const recordedOn = new Date().toISOString().slice(0, 10);
    const result = prepareRecommendation(round, application, recommendation, recordedOn);
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
    const summary = {
      status: "ok" as const,
      budget: round.budget,
      totals: { ...result.totals, withdrawnApplications: round.totals.withdrawnApplications },
    };
    if (previous && sameRecommendation(previous, next)) {
      return {
        ...summary,
        recommendation: previous,
        recommendationVersion: row.recommendationVersion,
      };
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
    changed(identity.organizationId, identity.organizationKind);

    return {
      ...summary,
      recommendation: next,
      recommendationVersion: row.recommendationVersion + 1,
    };
  });
};

const recordRecommendationEvent = async (
  tx: Transaction,
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
