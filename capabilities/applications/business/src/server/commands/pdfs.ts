import type { Actor } from "@merit/auth";
import type { Database, Transaction } from "@merit/db";
import { writeWorkspace } from "@merit/organizations/transactions";
import { lockPreparationRoundAccess } from "@merit/rounds/locks";
import type { FileReference } from "@merit/storage";

import { canEditIntakeContent } from "../../domain/intake";
import { applicationPdfSchema } from "../../domain/pdf";
import { findLockedIntakeApplication } from "../persistence/commands/intake";
import { lockApplicationCase } from "../persistence/commands/locks";
import { findCasePdfReference } from "../persistence/projections";
import { applicationPdfs } from "../persistence/schema";

type Target = { workspaceSlug: string } & ({ applicationId: string } | { roundId: string });

const uploadTarget = async (tx: Transaction, actor: Actor, target: Target) => {
  if ("roundId" in target) {
    const locked = await lockPreparationRoundAccess(tx, actor.userId, {
      workspaceSlug: target.workspaceSlug,
      publicId: target.roundId,
    });
    return (
      locked && {
        organizationId: locked.organizationId,
        kind: locked.organizationKind,
        roundId: locked.roundId,
        caseId: null,
      }
    );
  }
  const locked = await lockApplicationCase(tx, actor.userId, {
    workspaceSlug: target.workspaceSlug,
    publicId: target.applicationId,
  });
  if (!locked || locked.withdrawn) {
    return null;
  }
  const row = await findLockedIntakeApplication(locked);
  return row && canEditIntakeContent(row.application, row.workingRevision)
    ? {
        organizationId: locked.organizationId,
        kind: locked.organizationKind,
        roundId: locked.roundId,
        caseId: locked.caseId,
      }
    : null;
};

export const applicationPdfUploadAccess = (db: Database, actor: Actor, target: Target) =>
  writeWorkspace(
    db,
    actor.userId,
    target.workspaceSlug,
    async (tx) => (await uploadTarget(tx, actor, target))?.kind ?? null,
  );

export const registerApplicationPdf = (
  db: Database,
  actor: Actor,
  target: Target,
  file: { filename: string; reference: FileReference; sample: boolean },
) =>
  writeWorkspace(db, actor.userId, target.workspaceSlug, async (tx) => {
    const scope = await uploadTarget(tx, actor, target);
    if (!scope || (scope.kind === "demo" && !file.sample)) {
      return null;
    }
    const pdf = applicationPdfSchema.parse({
      id: crypto.randomUUID(),
      filename: file.filename,
      byteLength: file.reference.byteLength,
    });
    await tx.insert(applicationPdfs).values({
      ...pdf,
      ...file.reference,
      organizationId: scope.organizationId,
      roundId: scope.roundId,
      caseId: scope.caseId,
      uploaderId: actor.userId,
    });
    return pdf;
  });

export const readManagerApplicationPdf = (
  db: Database,
  actor: Actor,
  target: { workspaceSlug: string; applicationId: string; id: string },
) =>
  writeWorkspace(db, actor.userId, target.workspaceSlug, async (tx) => {
    const locked = await lockApplicationCase(tx, actor.userId, {
      workspaceSlug: target.workspaceSlug,
      publicId: target.applicationId,
    });
    return locked ? findCasePdfReference(tx, locked.caseId, target.id, actor.userId) : null;
  });
