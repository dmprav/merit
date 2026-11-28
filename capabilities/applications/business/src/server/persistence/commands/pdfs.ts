import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Transaction } from "@merit/db";

import type { ApplicationPdf } from "../../../domain/pdf";
import { applicationPdfs } from "../schema";

type PdfScope = { organizationId: string; roundId: string; userId: string; caseId: string | null };

/** The caller holds the target round or case lock until the intake snapshot and binding commit. */
export const canAttachApplicationPdfs = async (
  tx: Transaction,
  scope: PdfScope,
  files: ApplicationPdf[],
) => {
  if (!files.length) {
    return true;
  }
  const rows = await tx
    .select()
    .from(applicationPdfs)
    .where(
      and(
        eq(applicationPdfs.organizationId, scope.organizationId),
        eq(applicationPdfs.roundId, scope.roundId),
        scope.caseId === null
          ? isNull(applicationPdfs.caseId)
          : eq(applicationPdfs.caseId, scope.caseId),
        inArray(
          applicationPdfs.id,
          files.map((file) => file.id),
        ),
      ),
    )
    .for("update");
  return files.every((file) =>
    rows.some(
      (row) =>
        row.id === file.id &&
        row.filename === file.filename &&
        row.byteLength === file.byteLength &&
        (row.attachedAt !== null || row.uploaderId === scope.userId),
    ),
  );
};

export const bindApplicationPdfs = async (
  tx: Transaction,
  caseId: string,
  files: ApplicationPdf[],
) => {
  if (files.length) {
    await tx
      .update(applicationPdfs)
      .set({ caseId, attachedAt: new Date() })
      .where(
        and(
          inArray(
            applicationPdfs.id,
            files.map((file) => file.id),
          ),
          isNull(applicationPdfs.attachedAt),
        ),
      );
  }
};
