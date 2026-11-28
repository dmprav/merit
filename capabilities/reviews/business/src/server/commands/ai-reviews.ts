import { lockApplicationCase } from "@merit/applications/locks";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import type { DatabaseRunner, Transaction } from "@merit/db";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";
import { writeObservedWorkspace, writeWorkspace } from "@merit/organizations/transactions";

import { aiReviewRunRequestSchema, type AiReviewRunRequest } from "../../api/commands/ai-reviews";
import {
  aiReviewAvailability,
  aiReviewEntry,
  aiReviewInput,
  aiReviewInstructions,
  aiReviewPrior,
  aiReviewOutputJsonSchema,
  verifyAiReviewOutput,
  wholeApplicationTitle,
  type AiReviewer,
  type AiReviewOutput,
} from "../../domain/ai-review";
import {
  insertAiReview,
  readAiReviewByRun,
  readAiReviewBasis,
  readAiReviewConsent,
  readAiReviewRecords,
  readCurrentAiReviewBasis,
} from "../persistence/ai-reviews";
import { readReviewCriteria } from "../persistence/commands/reviews";

export type AiReviewDependencies = {
  /** Absent when this server has no provider configured. */
  reviewer?: AiReviewer;
  onSaved?: WorkspaceChangeObserver;
};

/** Everything a run depends on, read once and held for the whole run. */
const readRunBasis = async (tx: Transaction, organizationId: string, caseId: string) => {
  const basis = await readAiReviewBasis(tx, organizationId, caseId);
  const round = basis && (await readReviewCriteria(tx, organizationId, basis.roundId));
  if (!basis || !round) {
    return undefined;
  }
  return {
    roundId: basis.roundId,
    applicationVersion: basis.applicationVersion,
    criteriaVersion: round.criteriaVersion,
    criteria: round.criteria,
    input: aiReviewInput(basis.material, round.criteria),
  };
};

/** One saved run as the caller reads it, with its freshness against the application now. */
const readSavedEntry = async (
  tx: Transaction,
  organizationId: string,
  caseId: string,
  id: string,
) => {
  const current = await readCurrentAiReviewBasis(tx, organizationId, caseId);
  const records = await readAiReviewRecords(tx, organizationId, caseId);
  const saved = records.find((record) => record.id === id);
  if (!current || !saved) {
    throw new Error("The saved AI review could not be read.");
  }
  return aiReviewEntry(saved, current);
};

/** The freshness of the latest run already saved for the application, read before a new one is inserted. */
const readPrior = async (tx: Transaction, organizationId: string, caseId: string) => {
  const current = await readCurrentAiReviewBasis(tx, organizationId, caseId);
  return current
    ? aiReviewPrior(await readAiReviewRecords(tx, organizationId, caseId), current)
    : ("none" as const);
};

/**
 * The review this run's identity already saved, if any. Another application's run identity is not
 * this run's to reuse.
 */
const readSavedRun = async (
  tx: Transaction,
  organizationId: string,
  request: AiReviewRunRequest,
) => {
  const saved = await readAiReviewByRun(tx, organizationId, request.runId);
  if (!saved) {
    return undefined;
  }
  return saved.caseId === request.publicId
    ? ({
        status: "saved",
        review: await readSavedEntry(tx, organizationId, request.publicId, saved.id),
      } as const)
    : ({ status: "not_found" } as const);
};

/** The permission, consent, withdrawal and provider gate, checked again when saving. */
const openRun = async (
  tx: Transaction,
  actor: Actor,
  request: AiReviewRunRequest,
  reviewer: AiReviewer | undefined,
) => {
  const access = await lockApplicationCase(tx, actor.userId, request);
  if (!access) {
    return { status: "not_found" } as const;
  }
  // A run that already saved answers with its review, without the provider and whatever the
  // consent is now: the record was shared under the consent that applied.
  const saved = await readSavedRun(tx, access.organizationId, request);
  if (saved) {
    return saved;
  }
  const availability = aiReviewAvailability({
    workspaceKind: access.organizationKind,
    withdrawn: access.withdrawn,
    providerConfigured: reviewer !== undefined,
    consent: await readAiReviewConsent(tx, access.organizationId),
  });
  if (availability !== "available" || !reviewer) {
    return {
      status: "not_available",
      availability: availability === "available" ? "provider_unconfigured" : availability,
    } as const;
  }
  return { status: "open", access, reviewer } as const;
};

type RunBasis = NonNullable<Awaited<ReturnType<typeof readRunBasis>>>;

/** Ask the provider and verify its reply against exactly what it was sent. Any doubt is a failed run. */
const askProvider = async (reviewer: AiReviewer, basis: RunBasis) => {
  try {
    const reply = await reviewer.review({
      instructions: aiReviewInstructions,
      input: basis.input,
      outputSchema: aiReviewOutputJsonSchema,
      signal: reviewer.signal,
    });
    const verified = verifyAiReviewOutput(basis.input, reply);
    return verified.ok ? verified.output : undefined;
  } catch {
    return undefined;
  }
};

type Opened = Extract<Awaited<ReturnType<typeof openRun>>, { status: "open" }>;

/** Save the run against the basis it read, with its audit event, under the caller's transaction. */
const saveRun = async (
  tx: Transaction,
  { actor, request }: { actor: Actor; request: AiReviewRunRequest },
  { access, reviewer }: Opened,
  basis: RunBasis,
  output: AiReviewOutput,
) => {
  const prior = await readPrior(tx, access.organizationId, request.publicId);
  // The save may have waited on the case lock; a Stop that arrived meanwhile saves nothing.
  if (reviewer.signal?.aborted) {
    return { stopped: true } as const;
  }
  const id = await insertAiReview(tx, {
    organizationId: access.organizationId,
    runId: request.runId,
    caseId: request.publicId,
    applicationVersion: basis.applicationVersion,
    roundId: basis.roundId,
    criteriaVersion: basis.criteriaVersion,
    provider: reviewer.provider,
    model: reviewer.model,
    runBy: { userId: access.actor.userId, name: access.actor.name ?? access.actor.email ?? "" },
    provenance: actorProvenance(actor),
    titles:
      basis.criteria.length === 0
        ? [wholeApplicationTitle]
        : basis.criteria.map((value) => value.title),
    output,
  });
  if (!id) {
    // A concurrent run with this identity saved first; its review is the answer.
    const winner = await readAiReviewByRun(tx, access.organizationId, request.runId);
    return winner?.caseId === request.publicId
      ? ({
          created: false,
          review: await readSavedEntry(tx, access.organizationId, request.publicId, winner.id),
        } as const)
      : undefined;
  }
  await recordAuditEvent(tx, {
    organizationId: access.organizationId,
    actor: {
      userId: access.actor.userId,
      name: access.actor.name,
      provenance: actorProvenance(actor),
    },
    action: "ai_review.recorded",
    target: { type: "ai_review", id, revision: null, name: basis.input.application.title },
    context: { roundId: basis.roundId, applicationId: request.publicId },
    details: {
      provider: reviewer.provider,
      model: reviewer.model,
      applicationVersion: basis.applicationVersion,
      criteriaVersion: basis.criteriaVersion,
      position: output.position,
    },
  });
  return {
    created: true,
    prior,
    review: await readSavedEntry(tx, access.organizationId, request.publicId, id),
  } as const;
};

/** What the caller was shown must be what is sent: either version having moved on refuses the run. */
const differsFromExpected = (request: AiReviewRunRequest, basis: RunBasis) =>
  (request.expectedApplicationVersion !== undefined &&
    request.expectedApplicationVersion !== basis.applicationVersion) ||
  (request.expectedCriteriaVersion !== undefined &&
    request.expectedCriteriaVersion !== basis.criteriaVersion);

/** Open the run: gate it, read what it will send, and refuse it if that is not what was approved. */
const startRun = (
  database: DatabaseRunner,
  actor: Actor,
  request: AiReviewRunRequest,
  reviewer?: AiReviewer,
) =>
  database((db) =>
    writeWorkspace(db, actor.userId, request.workspaceSlug, async (tx) => {
      const opened = await openRun(tx, actor, request, reviewer);
      if (opened.status !== "open") {
        return opened;
      }
      const basis = await readRunBasis(tx, opened.access.organizationId, request.publicId);
      if (!basis) {
        return { status: "not_found" } as const;
      }
      return differsFromExpected(request, basis)
        ? ({ status: "conflict" } as const)
        : ({ status: "ready", basis, reviewer: opened.reviewer } as const);
    }),
  );

/**
 * A provider that failed may still have a run saved under this identity, by a concurrent run that
 * finished first. Look before reporting a failure, under the same authorization.
 */
const recheckFailedRun = (database: DatabaseRunner, actor: Actor, request: AiReviewRunRequest) =>
  database((db) =>
    writeWorkspace(db, actor.userId, request.workspaceSlug, async (tx) => {
      const access = await lockApplicationCase(tx, actor.userId, request);
      if (!access) {
        return { status: "not_found" } as const;
      }
      const saved = await readSavedRun(tx, access.organizationId, request);
      return saved?.status === "saved"
        ? ({ status: "ok", review: saved.review } as const)
        : (saved ?? ({ status: "failed" } as const));
    }),
  );

/**
 * Run an AI review and save it. The model call happens between two short transactions, never
 * inside one, and no pooled connection is held during it: each transaction checks out its own.
 */
export const runAiReview = async (
  database: DatabaseRunner,
  actor: Actor,
  input: AiReviewRunRequest,
  { reviewer, onSaved }: AiReviewDependencies,
) => {
  const parsed = aiReviewRunRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "not_found" } as const;
  }
  const request = parsed.data;

  const started = await startRun(database, actor, request, reviewer);
  if (started.status === "saved") {
    return { status: "ok", review: started.review } as const;
  }
  if (started.status !== "ready") {
    return started;
  }
  const output = await askProvider(started.reviewer, started.basis);
  // A stopped run saves nothing, whatever the provider answered before it was told to stop.
  if (started.reviewer.signal?.aborted) {
    return { status: "stopped" } as const;
  }
  if (!output) {
    return recheckFailedRun(database, actor, request);
  }

  return database((db) =>
    writeObservedWorkspace(db, actor, request, onSaved, async (tx, changed) => {
      // Permission, consent and withdrawal may have changed while the provider worked.
      const opened = await openRun(tx, actor, request, reviewer);
      if (opened.status === "saved") {
        return { status: "ok", review: opened.review } as const;
      }
      if (opened.status !== "open") {
        return opened;
      }
      const saved = await saveRun(tx, { actor, request }, opened, started.basis, output);
      if (!saved) {
        return { status: "not_found" } as const;
      }
      if ("stopped" in saved) {
        return { status: "stopped" } as const;
      }
      if (saved.created) {
        changed(opened.access.organizationId, opened.access.organizationKind, {
          applicationId: request.publicId,
          prior: saved.prior,
        });
      }
      return { status: "ok", review: saved.review } as const;
    }),
  );
};
