import { type Actor } from "@merit/auth";
import { allocatePublicId, type Database } from "@merit/db";
import { encodeMoney } from "@merit/money";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";
import { lockWorkspaceRow, lockGrantActor } from "@merit/organizations/locks";
import { writeObservedWorkspace, writeWorkspace } from "@merit/organizations/transactions";

import {
  createRoundRequestSchema,
  editRoundRequestSchema,
  deleteRoundRequestSchema,
  roundEditRequiresRevision,
  type CreateRoundRequest,
  type EditRoundRequest,
  type DeleteRoundRequest,
} from "../../api/commands/preparation";
import {
  budgetBelowCommitments,
  newPreparedRound,
  prepareRoundChange,
  withRoundManager,
} from "../../domain/preparation";
import type { RoundApplications, RoundCommitments } from "../grant-work";
import { lockFundingRound, lockPreparationRoundAccess } from "../persistence/commands/locks";
import {
  readCreationReceipt,
  recordPreparationCreation,
  recordPreparationChange,
  recordPreparationDeletion,
} from "../persistence/commands/preparation";

export const createFundingRound = async (
  db: Database,
  actor: Actor,
  input: CreateRoundRequest,
  onCommitted?: WorkspaceChangeObserver,
) => {
  const parsed = createRoundRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_round" } as const;
  }

  const request = parsed.data;
  return writeObservedWorkspace(db, actor, request, onCommitted, async (tx, changed) => {
    const workspace = await lockWorkspaceRow(
      tx,
      { slug: request.workspaceSlug, userId: actor.userId },
      "update",
    );
    if (!workspace) {
      return { status: "not_found" } as const;
    }

    const receipt = await readCreationReceipt(tx, workspace.organizationId, request.requestId);
    const existing = receipt && (await lockFundingRound(workspace, receipt.publicId, "update"));
    const manager = await lockGrantActor(workspace, actor.userId);
    if (!manager) {
      return { status: "not_found" } as const;
    }
    if (receipt) {
      return existing
        ? ({ status: "ok", publicId: existing.roundId } as const)
        : ({ status: "invalid", error: "round_deleted" } as const);
    }

    const round = newPreparedRound(request, {
      id: await allocatePublicId(tx),
      foundation: workspace.organization.name,
      manager,
      snapshotDate: new Date().toISOString().slice(0, 10),
    });
    const publicId = await recordPreparationCreation(
      tx,
      workspace.organization.id,
      round,
      actor,
      request.requestId,
      request.budgetReason,
    );
    changed(workspace.organization.id, workspace.organization.kind);
    return { status: "ok", publicId } as const;
  });
};

export const editFundingRound = async (
  db: Database,
  actor: Actor,
  input: EditRoundRequest,
  roundCommitments: RoundCommitments,
) => {
  const parsed = editRoundRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_round" } as const;
  }

  const request = parsed.data;
  return writeWorkspace(db, actor.userId, request.workspaceSlug, async (tx) => {
    const row = await lockPreparationRoundAccess(tx, actor.userId, request);
    if (!row) {
      return { status: "not_found" } as const;
    }
    if (roundEditRequiresRevision(request) && row.revision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }

    const budgetPreviouslySet =
      request.change.section === "budget" && row.round.budget === null && row.budgetEstablished;
    const result = prepareRoundChange(row.round, request.change, budgetPreviouslySet);
    if (!result.ok) {
      return { status: "invalid", error: result.error } as const;
    }

    // Decisions commit under this round lock, so the total cannot grow before this change commits.
    if (request.change.section === "budget" && result.changed) {
      const committed = await roundCommitments(row);
      if (budgetBelowCommitments(result.round.budget, committed)) {
        return {
          status: "invalid",
          error: "budget_below_commitments",
          committed: encodeMoney(committed),
        } as const;
      }
    }

    let updated = result.round;
    if (request.change.section === "manager") {
      const manager = await lockGrantActor(row, request.change.userId);
      if (!manager) {
        return { status: "invalid", error: "manager_unavailable" } as const;
      }
      updated = withRoundManager(updated, manager);
    }

    const revision = await recordPreparationChange(row, { ...result, round: updated }, actor);
    return { status: "ok", revision } as const;
  });
};

export const deleteFundingRound = async (
  db: Database,
  actor: Actor,
  input: DeleteRoundRequest,
  roundHasApplications: RoundApplications,
) => {
  const parsed = deleteRoundRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_round" } as const;
  }

  const request = parsed.data;
  return writeWorkspace(db, actor.userId, request.workspaceSlug, async (tx) => {
    const row = await lockPreparationRoundAccess(tx, actor.userId, request);
    if (!row) {
      return { status: "not_found" } as const;
    }
    if (row.revision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }

    if (await roundHasApplications(row)) {
      return { status: "invalid", error: "round_not_empty" } as const;
    }

    await recordPreparationDeletion(row, actor);
    return { status: "ok" } as const;
  });
};
