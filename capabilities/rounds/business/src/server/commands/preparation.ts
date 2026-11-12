import { actorProvenance, type Actor, type Provenance } from "@merit/auth";
import type { Database } from "@merit/db";
import { lockGrantWorkspace } from "@merit/organizations/locks";

import {
  createRoundRequestSchema,
  editRoundRequestSchema,
  deleteRoundRequestSchema,
  type CreateRoundRequest,
  type EditRoundRequest,
  type DeleteRoundRequest,
} from "../../api/commands/preparation";
import { newPreparedRound, prepareRoundChange, withRoundManager } from "../../domain/preparation";
import type { RoundApplications } from "../grant-work";
import {
  lockPreparationRound,
  readCreationReceipt,
  recordPreparationCreation,
  recordPreparationChange,
  recordPreparationDeletion,
  hasRoundBudgetHistory,
  lockManagerCandidate,
} from "../persistence/commands/preparation";
import { allocatePublicId } from "../persistence/identifiers";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Append in the supplied transaction; failure must roll back the round change. */
export type RecordRoundAudit = (
  tx: Transaction,
  event: {
    organizationId: string;
    actor: { userId: string; name: string | null; provenance: Provenance };
    action: `round.${"create" | "budget" | "criteria" | "manager" | "delete"}`;
    target: { type: "round"; id: string; revision: number };
  },
) => Promise<void>;

const auditActor = (access: { actor: { userId: string; name: string | null } }, actor: Actor) => ({
  userId: access.actor.userId,
  name: access.actor.name,
  provenance: actorProvenance(actor),
});

export const createFundingRound = async (
  db: Database,
  actor: Actor,
  input: CreateRoundRequest,
  recordAuditEvent: RecordRoundAudit,
) => {
  const parsed = createRoundRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_round" } as const;
  }

  const request = parsed.data;
  return db.transaction(async (tx) => {
    const access = await lockGrantWorkspace(tx, actor.userId, request.workspaceSlug, "update");
    if (!access) {
      return { status: "not_found" } as const;
    }

    const receipt = await readCreationReceipt(tx, access.organization.id, request.requestId);
    if (receipt) {
      const existing = await lockPreparationRound(tx, access.organization.id, receipt.publicId);
      return existing
        ? ({ status: "ok", publicId: existing.id } as const)
        : ({ status: "invalid", error: "round_deleted" } as const);
    }

    const round = newPreparedRound(request, {
      id: await allocatePublicId(tx),
      foundation: access.organization.name,
      manager: access.actor,
      snapshotDate: new Date().toISOString().slice(0, 10),
    });
    const publicId = await recordPreparationCreation(
      tx,
      access.organization.id,
      round,
      actor,
      request.requestId,
    );
    await recordAuditEvent(tx, {
      organizationId: access.organization.id,
      actor: auditActor(access, actor),
      action: "round.create",
      target: { type: "round", id: publicId, revision: 0 },
    });

    return { status: "ok", publicId } as const;
  });
};

export const editFundingRound = async (
  db: Database,
  actor: Actor,
  input: EditRoundRequest,
  recordAuditEvent: RecordRoundAudit,
) => {
  const parsed = editRoundRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_round" } as const;
  }

  const request = parsed.data;
  return db.transaction(async (tx) => {
    const access = await lockGrantWorkspace(tx, actor.userId, request.workspaceSlug, "share");
    if (!access) {
      return { status: "not_found" } as const;
    }

    const row = await lockPreparationRound(tx, access.organization.id, request.publicId);
    if (!row) {
      return { status: "not_found" } as const;
    }
    if (row.revision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }

    const budgetPreviouslySet =
      request.change.section === "budget" &&
      row.round.budget === null &&
      (await hasRoundBudgetHistory(tx, row.id));
    const result = prepareRoundChange(row.round, request.change, budgetPreviouslySet);
    if (!result.ok) {
      return { status: "invalid", error: result.error } as const;
    }

    let updated = result.round;
    if (request.change.section === "manager") {
      const manager = await lockManagerCandidate(tx, row.organizationId, request.change.userId);
      if (!manager) {
        return { status: "invalid", error: "manager_unavailable" } as const;
      }
      updated = withRoundManager(updated, manager);
    }

    const revision = await recordPreparationChange(tx, row, { ...result, round: updated }, actor);
    // Detail edits stay in preparation history; unchanged saves keep their revision.
    if (result.action !== "details" && revision !== row.revision) {
      await recordAuditEvent(tx, {
        organizationId: row.organizationId,
        actor: auditActor(access, actor),
        action: `round.${result.action}`,
        target: { type: "round", id: row.id, revision },
      });
    }

    return { status: "ok", revision } as const;
  });
};

export const deleteFundingRound = async (
  db: Database,
  actor: Actor,
  input: DeleteRoundRequest,
  roundHasApplications: RoundApplications,
  recordAuditEvent: RecordRoundAudit,
) => {
  const parsed = deleteRoundRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_round" } as const;
  }

  const request = parsed.data;
  return db.transaction(async (tx) => {
    const access = await lockGrantWorkspace(tx, actor.userId, request.workspaceSlug, "share");
    if (!access) {
      return { status: "not_found" } as const;
    }

    const row = await lockPreparationRound(tx, access.organization.id, request.publicId);
    if (!row) {
      return { status: "not_found" } as const;
    }
    if (row.revision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }

    if (await roundHasApplications(tx, row.organizationId, row.id)) {
      return { status: "invalid", error: "round_not_empty" } as const;
    }

    await recordPreparationDeletion(tx, row, actor);
    await recordAuditEvent(tx, {
      organizationId: row.organizationId,
      actor: auditActor(access, actor),
      action: "round.delete",
      target: { type: "round", id: row.id, revision: row.revision + 1 },
    });
    return { status: "ok" } as const;
  });
};
