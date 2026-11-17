import type { TFunction } from "i18next";

type Translate = TFunction<"applicationDocuments">;

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ApplicationDocuments, SourceDocumentRole } from "@merit/applications/api";
import { decodeBase64, encodeBase64 } from "@merit/applications/domain";

import type { ApplicationDocumentSession } from "../../contracts/documents";

export type DocumentReader = {
  role: SourceDocumentRole;
  version: number;
  page: number;
  filename: string;
  pageCount: number;
  url: string;
  openerId: string;
};

type InitialReader = {
  role: SourceDocumentRole;
  version: number;
  page: number;
  filename: string;
  pageCount: number;
  bytes: Uint8Array;
};

const blobUrl = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes);
  return URL.createObjectURL(new Blob([copy.buffer], { type: "application/pdf" }));
};

const refreshDocuments = async (session: ApplicationDocumentSession) => {
  try {
    await session.refresh?.();
  } catch {
    // A failed refresh leaves the documents already saved in this view.
  }
};

const attachMessage = (t: Translate, error: string) => {
  if (error === "not_pdf") {
    return t("notPdf");
  }
  if (error === "too_large") {
    return t("tooLarge");
  }
  if (error === "unreadable_pdf") {
    return t("unreadable");
  }
  if (error === "application_withdrawn") {
    return t("withdrawn");
  }
  if (error === "conflict") {
    return t("conflict");
  }
  return t("attachFailed");
};

const citeMessage = (t: Translate, error: string) => {
  if (error === "page_out_of_range") {
    return t("pageOutOfRange");
  }
  if (error === "version_not_found") {
    return t("versionMissing");
  }
  if (error === "note_too_long") {
    return t("noteTooLong");
  }
  if (error === "application_withdrawn") {
    return t("withdrawn");
  }
  return t("saveFailed");
};

const attachDocument = async ({
  role,
  file,
  session,
  documents,
  t,
  setDocuments,
  setNotice,
  setPendingRole,
}: {
  role: SourceDocumentRole;
  file: File;
  session: ApplicationDocumentSession;
  documents: ApplicationDocuments;
  t: Translate;
  setDocuments: (documents: ApplicationDocuments) => void;
  setNotice: (notice: string | null) => void;
  setPendingRole: (role: SourceDocumentRole | null) => void;
}) => {
  if (!session.attach) {
    return;
  }
  setNotice(null);
  setPendingRole(role);
  let result: Awaited<ReturnType<NonNullable<ApplicationDocumentSession["attach"]>>> | undefined;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    result = await session.attach({
      role,
      filename: file.name,
      contentBase64: encodeBase64(bytes),
      expectedVersion: documents[role].currentVersion ?? 0,
    });
  } catch {
    setNotice(t("unreadable"));
  }
  setPendingRole(null);
  if (!result || result.status === "ok") {
    if (result?.status === "ok") {
      setDocuments(result.documents);
      await refreshDocuments(session);
    }
    return;
  }
  if (result.status === "conflict") {
    await refreshDocuments(session);
  }
  setNotice(attachMessage(t, result.status === "invalid" ? result.error : result.status));
};

const openDocument = async ({
  role,
  version,
  page,
  openerId,
  session,
  t,
  setNotice,
  setReader,
}: {
  role: SourceDocumentRole;
  version: number;
  page: number;
  openerId: string;
  session: ApplicationDocumentSession;
  t: Translate;
  setNotice: (notice: string | null) => void;
  setReader: (reader: DocumentReader) => void;
}) => {
  setNotice(null);
  try {
    const result = await session.readFile({ role, version });
    if (result.status !== "ok") {
      setNotice(t("openFailed"));
      return false;
    }
    const bytes = decodeBase64(result.contentBase64);
    if (!bytes) {
      setNotice(t("openFailed"));
      return false;
    }
    setReader({
      role,
      version,
      page,
      filename: result.filename,
      pageCount: result.pageCount,
      url: blobUrl(bytes),
      openerId,
    });
    return true;
  } catch {
    setNotice(t("openFailed"));
    return false;
  }
};

const citeDocument = async ({
  note,
  reader,
  session,
  t,
  setDocuments,
}: {
  note: string;
  reader: DocumentReader | null;
  session: ApplicationDocumentSession;
  t: Translate;
  setDocuments: (documents: ApplicationDocuments) => void;
}) => {
  if (!reader || !session.cite) {
    return t("saveFailed");
  }
  const result = await session.cite({
    role: reader.role,
    version: reader.version,
    page: reader.page,
    note,
  });
  if (result.status === "ok") {
    setDocuments(result.documents);
    await refreshDocuments(session);
    return null;
  }
  return citeMessage(t, result.status === "invalid" ? result.error : result.status);
};

const readerFrom = (initial: InitialReader): DocumentReader => ({
  role: initial.role,
  version: initial.version,
  page: initial.page,
  filename: initial.filename,
  pageCount: initial.pageCount,
  url: blobUrl(initial.bytes),
  openerId: `view-${initial.role}-${initial.version}`,
});

const changePage = (reader: DocumentReader | null, value: string) => {
  if (!reader) {
    return reader;
  }
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > reader.pageCount) {
    return reader;
  }
  return { ...reader, page };
};

export const useApplicationDocuments = ({
  documents: incoming,
  session,
  initialNotice = null,
  initialReader = null,
}: {
  documents: ApplicationDocuments;
  session: ApplicationDocumentSession;
  initialNotice?: string | null;
  initialReader?: InitialReader | null;
}) => {
  const { t } = useTranslation("applicationDocuments");
  const [documents, setDocuments] = useState(incoming);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const [pendingRole, setPendingRole] = useState<SourceDocumentRole | null>(null);
  const [reader, setReader] = useState<DocumentReader | null>(() =>
    initialReader ? readerFrom(initialReader) : null,
  );
  const readerUrl = reader?.url ?? null;

  useEffect(() => {
    setDocuments(incoming);
  }, [incoming]);

  useEffect(() => {
    if (!readerUrl) {
      return undefined;
    }
    return () => URL.revokeObjectURL(readerUrl);
  }, [readerUrl]);

  return {
    documents,
    notice,
    pendingRole,
    reader,
    attachFile: (role: SourceDocumentRole, file: File) => {
      if (pendingRole) {
        return;
      }
      return attachDocument({
        role,
        file,
        session,
        documents,
        t,
        setDocuments,
        setNotice,
        setPendingRole,
      });
    },
    openReader: (role: SourceDocumentRole, version: number, page: number, openerId: string) =>
      openDocument({ role, version, page, openerId, session, t, setNotice, setReader }),
    closeReader: () => setReader(null),
    setPage: (value: string) => setReader(changePage(reader, value)),
    cite: (note: string) => citeDocument({ note, reader, session, t, setDocuments }),
  };
};
