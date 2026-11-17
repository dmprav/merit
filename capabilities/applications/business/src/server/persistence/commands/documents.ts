import { and, eq } from "drizzle-orm";

import { recordAuditEvent } from "@merit/audit/server/record";
import { actorProvenance, type Actor } from "@merit/auth";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";

import { documentPage, type SourceDocumentRole } from "../../../domain/documents";
import {
  applicationCases,
  sourceDocumentCitations,
  sourceDocuments,
  sourceDocumentVersions,
} from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const readDocumentManager = async (
  db: Transaction,
  userId: string,
  input: { workspaceSlug: string; publicId: string },
) => {
  const [row] = await db
    .select({
      caseId: applicationCases.id,
      organizationId: applicationCases.organizationId,
      roundId: applicationCases.roundId,
      title: applicationCases.searchTitle,
    })
    .from(applicationCases)
    .innerJoin(organizations, eq(organizations.id, applicationCases.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        eq(organizations.slug, input.workspaceSlug),
        eq(applicationCases.id, input.publicId),
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    );
  return row ?? null;
};

const documentTarget = (title: string, caseId: string, version: number) => ({
  type: "application_document",
  id: caseId,
  revision: version,
  name: title.length > 0 ? title : undefined,
});

const applicationTitle = async (tx: Transaction, caseId: string) =>
  (
    await tx
      .select({ title: applicationCases.searchTitle })
      .from(applicationCases)
      .where(eq(applicationCases.id, caseId))
  )[0]?.title ?? "";

export const attachSourceDocument = async (
  tx: Transaction,
  input: {
    actor: Actor;
    caseId: string;
    organizationId: string;
    roundId: string;
    role: SourceDocumentRole;
    expectedVersion: number;
    filename: string;
    pageCount: number;
    content: Uint8Array;
    recorderName: string;
    recordedAt: Date;
  },
) => {
  const [slot] = await tx
    .select({ currentVersion: sourceDocuments.currentVersion })
    .from(sourceDocuments)
    .where(and(eq(sourceDocuments.caseId, input.caseId), eq(sourceDocuments.role, input.role)))
    .for("update");
  const currentVersion = slot?.currentVersion ?? 0;
  if (currentVersion !== input.expectedVersion) {
    return { status: "conflict" } as const;
  }
  const version = currentVersion + 1;
  if (slot) {
    await tx
      .update(sourceDocuments)
      .set({ currentVersion: version })
      .where(and(eq(sourceDocuments.caseId, input.caseId), eq(sourceDocuments.role, input.role)));
  } else {
    await tx.insert(sourceDocuments).values({
      caseId: input.caseId,
      organizationId: input.organizationId,
      role: input.role,
      currentVersion: version,
    });
  }
  await tx.insert(sourceDocumentVersions).values({
    caseId: input.caseId,
    role: input.role,
    version,
    filename: input.filename,
    pageCount: input.pageCount,
    byteSize: input.content.byteLength,
    content: input.content,
    recorderUserId: input.actor.userId,
    recorderName: input.recorderName,
    recordedAt: input.recordedAt,
  });
  await recordAuditEvent(tx, {
    organizationId: input.organizationId,
    actor: {
      userId: input.actor.userId,
      name: input.recorderName,
      provenance: actorProvenance(input.actor),
    },
    action: "application.document.attach",
    target: documentTarget(await applicationTitle(tx, input.caseId), input.caseId, version),
    context: { roundId: input.roundId, applicationId: input.caseId },
    details: {
      role: input.role,
      version,
      filename: input.filename,
      pageCount: input.pageCount,
      byteSize: input.content.byteLength,
    },
    recordedAt: input.recordedAt,
  });
  return { status: "ok", version } as const;
};

export const citeSourceDocumentPage = async (
  tx: Transaction,
  input: {
    actor: Actor;
    caseId: string;
    organizationId: string;
    roundId: string;
    role: SourceDocumentRole;
    version: number;
    page: number;
    note: string | null;
    recorderName: string;
    recordedAt: Date;
  },
) => {
  if (!Number.isInteger(input.version) || input.version < 1) {
    return { status: "invalid", error: "version_not_found" } as const;
  }
  const [versionRow] = await tx
    .select({ pageCount: sourceDocumentVersions.pageCount })
    .from(sourceDocumentVersions)
    .where(
      and(
        eq(sourceDocumentVersions.caseId, input.caseId),
        eq(sourceDocumentVersions.role, input.role),
        eq(sourceDocumentVersions.version, input.version),
      ),
    );
  if (!versionRow || !documentPage(input.page, versionRow.pageCount)) {
    return {
      status: "invalid",
      error: versionRow ? "page_out_of_range" : "version_not_found",
    } as const;
  }
  const [citation] = await tx
    .insert(sourceDocumentCitations)
    .values({
      organizationId: input.organizationId,
      caseId: input.caseId,
      role: input.role,
      version: input.version,
      page: input.page,
      note: input.note,
      recorderUserId: input.actor.userId,
      recorderName: input.recorderName,
      recordedAt: input.recordedAt,
    })
    .returning({ id: sourceDocumentCitations.id });
  if (!citation) {
    return { status: "invalid", error: "version_not_found" } as const;
  }
  await recordAuditEvent(tx, {
    organizationId: input.organizationId,
    actor: {
      userId: input.actor.userId,
      name: input.recorderName,
      provenance: actorProvenance(input.actor),
    },
    action: "application.document.cite",
    target: documentTarget(await applicationTitle(tx, input.caseId), input.caseId, input.version),
    context: { roundId: input.roundId, applicationId: input.caseId },
    details: {
      citationId: citation.id,
      role: input.role,
      version: input.version,
      page: input.page,
      note: input.note,
    },
    recordedAt: input.recordedAt,
  });
  return { status: "ok", citationId: citation.id } as const;
};
