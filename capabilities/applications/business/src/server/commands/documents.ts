import { getDocumentProxy } from "unpdf";

import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";

import {
  attachApplicationDocumentInputSchema,
  citeApplicationDocumentInputSchema,
  listApplicationDocumentsInputSchema,
  readApplicationDocumentFileInputSchema,
  type AttachApplicationDocumentRequest,
  type CiteApplicationDocumentRequest,
  type ListApplicationDocumentsRequest,
  type ReadApplicationDocumentFileRequest,
} from "../../api/commands/documents";
import {
  decodeBase64,
  documentFilename,
  documentNote,
  encodeBase64,
  inspectPdfBytes,
} from "../../domain/documents";
import {
  attachSourceDocument,
  citeSourceDocumentPage,
  readDocumentManager,
} from "../persistence/commands/documents";
import { lockApplicationCase } from "../persistence/commands/locks";
import { readApplicationDocuments, readSourceDocumentFile } from "../persistence/projections";

const recorderName = (person: { name: string | null; email: string | null }) =>
  person.name ?? person.email ?? "";

/** Opens the PDF only here. Domain validation stays free of this package. */
const countPdfPages = async (bytes: Uint8Array) => {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
    return pdf.numPages >= 1 ? pdf.numPages : null;
  } catch {
    return null;
  } finally {
    await pdf?.destroy();
  }
};

const acceptedPdf = async (contentBase64: string) => {
  const bytes = decodeBase64(contentBase64);
  if (!bytes) {
    return { ok: false as const, error: "not_pdf" as const };
  }
  const inspected = inspectPdfBytes(bytes);
  if (!inspected.ok) {
    return inspected;
  }
  const pageCount = await countPdfPages(bytes);
  return pageCount === null
    ? { ok: false as const, error: "unreadable_pdf" as const }
    : { ok: true as const, bytes, pageCount };
};

export const listApplicationDocuments = (
  db: Database,
  actor: Actor,
  input: ListApplicationDocumentsRequest,
) =>
  readTransaction(db, async (tx) => {
    const request = listApplicationDocumentsInputSchema.parse(input);
    const access = await readDocumentManager(tx, actor.userId, request);
    if (!access) {
      return { status: "not_found" } as const;
    }
    return {
      status: "ok" as const,
      documents: await readApplicationDocuments(tx, access.caseId),
    };
  });

export const attachApplicationDocument = async (
  db: Database,
  actor: Actor,
  input: AttachApplicationDocumentRequest,
) => {
  const request = attachApplicationDocumentInputSchema.parse(input);
  const allowed = await readTransaction(db, (tx) => readDocumentManager(tx, actor.userId, request));
  if (!allowed) {
    return { status: "not_found" as const };
  }
  const pdf = await acceptedPdf(request.contentBase64);
  if (!pdf.ok) {
    return { status: "invalid" as const, error: pdf.error };
  }
  return db.transaction(async (tx) => {
    const locked = await lockApplicationCase(tx, actor.userId, request);
    if (!locked) {
      return { status: "not_found" } as const;
    }
    if (locked.withdrawn) {
      return { status: "invalid" as const, error: "application_withdrawn" as const };
    }
    const attached = await attachSourceDocument(tx, {
      actor,
      caseId: request.publicId,
      organizationId: locked.organizationId,
      roundId: locked.roundId,
      role: request.role,
      expectedVersion: request.expectedVersion,
      filename: documentFilename(request.filename),
      pageCount: pdf.pageCount,
      content: pdf.bytes,
      recorderName: recorderName(locked.actor),
      recordedAt: new Date(),
    });
    if (attached.status !== "ok") {
      return attached;
    }
    return {
      status: "ok" as const,
      version: attached.version,
      documents: await readApplicationDocuments(tx, request.publicId),
    };
  });
};

export const citeApplicationDocumentPage = async (
  db: Database,
  actor: Actor,
  input: CiteApplicationDocumentRequest,
) => {
  const request = citeApplicationDocumentInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const locked = await lockApplicationCase(tx, actor.userId, request);
    if (!locked) {
      return { status: "not_found" } as const;
    }
    if (locked.withdrawn) {
      return { status: "invalid" as const, error: "application_withdrawn" as const };
    }
    const note = documentNote(request.note);
    if (!note.ok) {
      return { status: "invalid" as const, error: note.error };
    }
    const cited = await citeSourceDocumentPage(tx, {
      actor,
      caseId: request.publicId,
      organizationId: locked.organizationId,
      roundId: locked.roundId,
      role: request.role,
      version: request.version,
      page: request.page,
      note: note.note,
      recorderName: recorderName(locked.actor),
      recordedAt: new Date(),
    });
    if (cited.status !== "ok") {
      return cited;
    }
    return {
      status: "ok" as const,
      citationId: cited.citationId,
      documents: await readApplicationDocuments(tx, request.publicId),
    };
  });
};

export const readApplicationDocumentFile = (
  db: Database,
  actor: Actor,
  input: ReadApplicationDocumentFileRequest,
) =>
  readTransaction(db, async (tx) => {
    const request = readApplicationDocumentFileInputSchema.parse(input);
    const access = await readDocumentManager(tx, actor.userId, request);
    if (!access) {
      return { status: "not_found" } as const;
    }
    const file = await readSourceDocumentFile(tx, access.caseId, request.role, request.version);
    if (!file) {
      return { status: "invalid" as const, error: "version_not_found" as const };
    }
    return {
      status: "ok" as const,
      role: request.role,
      version: request.version,
      filename: file.filename,
      pageCount: file.pageCount,
      byteSize: file.byteSize,
      contentBase64: encodeBase64(file.content),
    };
  });
