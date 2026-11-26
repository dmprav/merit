import { lockApplicationCase } from "@merit/applications/locks";
import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import type { Database, Transaction } from "@merit/db";
import { decodeMoney, type Money } from "@merit/money";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";
import { writeObservedWorkspace } from "@merit/organizations/transactions";

import { recordDecisionRequestSchema, type RecordDecisionRequest } from "../../api/commands";
import { previewCommitment } from "../../domain/commitment";
import { prepareDecision, type Decision } from "../../domain/decision";
import { commitsFunding } from "../../domain/decision-outcome";
import { readDecisionState, writeDecision } from "../persistence/commands/decisions";

type DecisionState = NonNullable<Awaited<ReturnType<typeof readDecisionState>>>;

const readyForFunding = (application: DecisionState["application"]) =>
  application.intakeStatus !== "in_preparation" && application.requested !== null;

const decodeAmount = (input: RecordDecisionRequest["decision"]["amount"]) => {
  try {
    return decodeMoney(input);
  } catch {
    return null;
  }
};

export const recordCommitteeDecision = async (
  db: Database,
  actor: Actor,
  input: RecordDecisionRequest,
  onCommitted?: WorkspaceChangeObserver,
) => {
  const parsed = recordDecisionRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_decision" } as const;
  }

  const request = parsed.data;
  const amount = decodeAmount(request.decision.amount);
  if (amount === null) {
    return { status: "invalid", error: "invalid_decision" } as const;
  }

  return writeObservedWorkspace(db, actor, request, onCommitted, async (tx, changed) => {
    // The round row lock serializes this save against budget changes and other commitments.
    const identity = await lockApplicationCase(tx, actor.userId, request, "update");
    if (!identity) {
      return { status: "not_found" } as const;
    }
    if (identity.withdrawn) {
      return { status: "invalid", error: "application_withdrawn" } as const;
    }

    const row = await readDecisionState(tx, identity.organizationId, request.publicId);
    if (!row) {
      return { status: "not_found" } as const;
    }
    if (row.decisionRevision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }

    const recordedAt = new Date().toISOString();
    const prepared = prepareDecision(row.current, { ...request.decision, amount }, recordedAt);
    if (!prepared.ok) {
      return { status: "invalid", error: prepared.issues[0]?.code ?? "invalid_decision" } as const;
    }

    const { round } = row;
    if (prepared.unchanged) {
      return unchanged(row, prepared.current);
    }

    const next = prepared.decision;
    if (commitsFunding(next.outcome) && !readyForFunding(row.application)) {
      return { status: "invalid", error: "application_not_ready" } as const;
    }
    const preview = previewCommitment(
      { budget: round.budget, committed: round.totals.committed },
      row.current,
      next,
    );
    if (!preview.ok) {
      return preview.error === "committed_total_too_large"
        ? ({ status: "invalid", error: preview.error } as const)
        : ({
            status: "invalid",
            error: preview.error,
            budget: preview.budget,
            committed: preview.committed,
            excess: preview.excess,
          } as const);
    }

    const saved = await appendDecision(tx, {
      identity,
      actor,
      row,
      request,
      next,
      totals: preview.totals,
      recordedAt,
    });
    if (saved.status === "ok") {
      changed(identity.organizationId, identity.organizationKind);
    }
    return saved;
  });
};

type Identity = NonNullable<Awaited<ReturnType<typeof lockApplicationCase>>>;

/** Appends the next version and its audit event in the caller's transaction. */
const appendDecision = async (
  tx: Transaction,
  {
    identity,
    actor,
    row,
    request,
    next,
    totals,
    recordedAt,
  }: {
    identity: Identity;
    actor: Actor;
    row: DecisionState;
    request: RecordDecisionRequest;
    next: Omit<Decision, "recorder" | "recordedAt" | "applicationVersion">;
    totals: { committed: Money; available: Money | null };
    recordedAt: string;
  },
) => {
  const decision: Decision = {
    ...next,
    recorder: {
      userId: identity.actor.userId,
      name: identity.actor.name ?? "",
      provenance: actorProvenance(actor),
    },
    recordedAt,
    applicationVersion: row.application.version,
  };
  const revision = row.decisionRevision + 1;
  const written = await writeDecision(tx, {
    publicId: request.publicId,
    expectedRevision: request.expectedRevision,
    recorder: { userId: identity.actor.userId, provenance: actorProvenance(actor) },
    after: decision,
  });
  if (!written) {
    return { status: "conflict" } as const;
  }

  await recordDecisionEvent(tx, { identity, actor, row, request, revision, decision });

  return {
    status: "ok",
    recorded: true,
    decision: { revision, decision },
    budget: row.round.budget,
    totals: { ...totals, withdrawnApplications: row.round.totals.withdrawnApplications },
  } as const;
};

const unchanged = (row: DecisionState, current: Decision) =>
  ({
    status: "ok",
    recorded: false,
    decision: { revision: row.decisionRevision, decision: current },
    budget: row.round.budget,
    totals: row.round.totals,
  }) as const;

const recordDecisionEvent = async (
  tx: Transaction,
  {
    identity,
    actor,
    row,
    request,
    revision,
    decision,
  }: {
    identity: Identity;
    actor: Actor;
    row: DecisionState;
    request: RecordDecisionRequest;
    revision: number;
    decision: Decision;
  },
) => {
  await recordAuditEvent(tx, {
    organizationId: identity.organizationId,
    actor: {
      userId: identity.actor.userId,
      name: identity.actor.name,
      provenance: actorProvenance(actor),
    },
    action: revision === 1 ? "decision.recorded" : "decision.amended",
    target: { type: "decision", id: request.publicId, revision, name: row.title },
    context: { roundId: row.roundId, applicationId: request.publicId },
    details: {
      outcome: decision.outcome,
      applicationVersion: decision.applicationVersion,
      // Activity shows an amendment's explanation where it shows other reasons.
      ...(decision.changeExplanation === undefined ? {} : { reason: decision.changeExplanation }),
    },
  });
};
