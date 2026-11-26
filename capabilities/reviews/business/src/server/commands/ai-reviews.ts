import { lockApplicationCase } from "@merit/applications/locks";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import type { Database, Transaction } from "@merit/db";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";
import { writeObservedWorkspace, writeWorkspace } from "@merit/organizations/transactions";

import { aiReviewRequestSchema, type AiReviewRequest } from "../../api/commands/ai-reviews";
import {
  aiReviewAvailability,
  aiReviewEntry,
  aiReviewInput,
  aiReviewInstructions,
  aiReviewOutputJsonSchema,
  verifyAiReviewOutput,
  wholeApplicationTitle,
  type AiReviewer,
  type AiReviewOutput,
} from "../../domain/ai-review";
import {
  insertAiReview,
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

/** The permission, consent, withdrawal and provider gate, checked again when saving. */
const openRun = async (
  tx: Transaction,
  actor: Actor,
  request: AiReviewRequest,
  reviewer: AiReviewer | undefined,
) => {
  const access = await lockApplicationCase(tx, actor.userId, request);
  if (!access) {
    return { status: "not_found" } as const;
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
  { actor, request }: { actor: Actor; request: AiReviewRequest },
  { access, reviewer }: Opened,
  basis: RunBasis,
  output: AiReviewOutput,
) => {
  const id = await insertAiReview(tx, {
    organizationId: access.organizationId,
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
  const current = await readCurrentAiReviewBasis(tx, access.organizationId, request.publicId);
  const records = await readAiReviewRecords(tx, access.organizationId, request.publicId);
  const saved = records.find((record) => record.id === id);
  if (!current || !saved) {
    throw new Error("The saved AI review could not be read.");
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
      provider: saved.provider,
      model: saved.model,
      applicationVersion: saved.applicationVersion,
      criteriaVersion: saved.criteriaVersion,
      position: saved.position,
    },
  });
  return aiReviewEntry(saved, current);
};

/** Run an AI review and save it. The model call happens between two short transactions, never inside one. */
export const runAiReview = async (
  db: Database,
  actor: Actor,
  input: AiReviewRequest,
  { reviewer, onSaved }: AiReviewDependencies,
) => {
  const parsed = aiReviewRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "not_found" } as const;
  }
  const request = parsed.data;

  const started = await writeWorkspace(db, actor.userId, request.workspaceSlug, async (tx) => {
    const opened = await openRun(tx, actor, request, reviewer);
    if (opened.status !== "open") {
      return opened;
    }
    const basis = await readRunBasis(tx, opened.access.organizationId, request.publicId);
    return basis
      ? ({ status: "ready", basis, reviewer: opened.reviewer } as const)
      : ({ status: "not_found" } as const);
  });
  if (started.status !== "ready") {
    return started;
  }
  const output = await askProvider(started.reviewer, started.basis);
  if (!output) {
    return { status: "failed" } as const;
  }

  return writeObservedWorkspace(db, actor, request, onSaved, async (tx, changed) => {
    // Permission, consent and withdrawal may have changed while the provider worked.
    const opened = await openRun(tx, actor, request, reviewer);
    if (opened.status !== "open") {
      return opened;
    }
    const review = await saveRun(tx, { actor, request }, opened, started.basis, output);
    changed(opened.access.organizationId, opened.access.organizationKind);
    return { status: "ok", review } as const;
  });
};
