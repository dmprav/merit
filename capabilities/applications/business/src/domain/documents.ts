/** Proposal and budget PDFs attached to one application. An empty slot is not a version. */

export const sourceDocumentRoles = ["proposal", "budget"] as const;

export type SourceDocumentRole = (typeof sourceDocumentRoles)[number];

export const maxDocumentBytes = 20 * 1024 * 1024;

const maxFilenameLength = 200;

const maxNoteLength = 2000;

const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2d];

export type DocumentRecorder = { userId: string; name: string };

export type DocumentVersion = {
  version: number;
  filename: string;
  pageCount: number;
  byteSize: number;
  recorder: DocumentRecorder;
  recordedAt: string;
};

export type DocumentCitation = {
  id: string;
  role: SourceDocumentRole;
  version: number;
  page: number;
  note: string | null;
  recorder: DocumentRecorder;
  recordedAt: string;
  currentVersion: number;
};

export type DocumentSlot = {
  currentVersion: number | null;
  versions: DocumentVersion[];
  citations: DocumentCitation[];
};

export type ApplicationDocuments = {
  proposal: DocumentSlot;
  budget: DocumentSlot;
};

export type DocumentVersionRecord = {
  role: SourceDocumentRole;
  version: number;
  filename: string;
  pageCount: number;
  byteSize: number;
  recorderUserId: string;
  recorderName: string;
  recordedAt: string;
};

export type DocumentCitationRecord = {
  id: string;
  role: SourceDocumentRole;
  version: number;
  page: number;
  note: string | null;
  recorderUserId: string;
  recorderName: string;
  recordedAt: string;
};

export type DocumentSlotRecord = { role: SourceDocumentRole; currentVersion: number };

const characters = (value: string) => Array.from(value);

/** Display name: no directory, no control characters, at most 200 characters. */
export const documentFilename = (name: string) => {
  const segments = name.split(/[/\\]/);
  const base = segments[segments.length - 1]!;
  const cleaned = characters(base.replace(/\p{Cc}/gu, "").trim())
    .slice(0, maxFilenameLength)
    .join("");
  return cleaned.length > 0 ? cleaned : "document.pdf";
};

/** Optional note. Blank is no note. Length is counted in Unicode characters. */
export const documentNote = (
  note: string | undefined,
): { ok: true; note: string | null } | { ok: false; error: "note_too_long" } => {
  if (note === undefined) {
    return { ok: true, note: null };
  }
  const trimmed = note.trim();
  if (characters(trimmed).length > maxNoteLength) {
    return { ok: false, error: "note_too_long" };
  }
  return { ok: true, note: trimmed.length > 0 ? trimmed : null };
};

/** Header and size only. Page count stays with the server command that opens the file. */
export const inspectPdfBytes = (
  bytes: Uint8Array,
): { ok: true } | { ok: false; error: "not_pdf" | "too_large" } => {
  if (bytes.byteLength > maxDocumentBytes) {
    return { ok: false, error: "too_large" };
  }
  if (
    bytes.byteLength < pdfHeader.length ||
    pdfHeader.some((byte, index) => bytes[index] !== byte)
  ) {
    return { ok: false, error: "not_pdf" };
  }
  return { ok: true };
};

export const documentPage = (page: number, pageCount: number) =>
  Number.isInteger(page) && page >= 1 && page <= pageCount;

export const encodeBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

export const decodeBase64 = (value: string): Uint8Array | null => {
  if (value.length % 4 === 1) {
    return null;
  }
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
};

const recorder = (userId: string, name: string): DocumentRecorder => ({ userId, name });

const emptySlot = (): DocumentSlot => ({ currentVersion: null, versions: [], citations: [] });

export const emptyApplicationDocuments = (): ApplicationDocuments => ({
  proposal: emptySlot(),
  budget: emptySlot(),
});

/** Newest version and newest citation first. Citations keep the slot's current version. */
export const assembleApplicationDocuments = (
  slots: readonly DocumentSlotRecord[],
  versions: readonly DocumentVersionRecord[],
  citations: readonly DocumentCitationRecord[],
): ApplicationDocuments => {
  const current = new Map(slots.map((slot) => [slot.role, slot.currentVersion]));

  const slot = (role: SourceDocumentRole): DocumentSlot => {
    const currentVersion = current.get(role) ?? null;
    return {
      currentVersion,
      versions: versions
        .filter((version) => version.role === role)
        .sort((left, right) => right.version - left.version)
        .map((version) => ({
          version: version.version,
          filename: version.filename,
          pageCount: version.pageCount,
          byteSize: version.byteSize,
          recorder: recorder(version.recorderUserId, version.recorderName),
          recordedAt: version.recordedAt,
        })),
      citations:
        currentVersion === null
          ? []
          : citations
              .filter((citation) => citation.role === role)
              .sort(
                (left, right) =>
                  right.recordedAt.localeCompare(left.recordedAt) ||
                  right.id.localeCompare(left.id),
              )
              .map((citation) => ({
                id: citation.id,
                role: citation.role,
                version: citation.version,
                page: citation.page,
                note: citation.note,
                recorder: recorder(citation.recorderUserId, citation.recorderName),
                recordedAt: citation.recordedAt,
                currentVersion,
              })),
    };
  };

  return { proposal: slot("proposal"), budget: slot("budget") };
};
