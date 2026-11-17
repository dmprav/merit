import { describe, expect, it } from "vite-plus/test";

import {
  assembleApplicationDocuments,
  decodeBase64,
  documentFilename,
  documentNote,
  documentPage,
  emptyApplicationDocuments,
  encodeBase64,
  inspectPdfBytes,
  maxDocumentBytes,
  type DocumentCitationRecord,
  type DocumentVersionRecord,
} from "./documents";

const header = new TextEncoder().encode("%PDF-");

describe("document filenames", () => {
  it("keeps a plain name and drops a directory, controls, and surrounding space", () => {
    expect(documentFilename("proposal.pdf")).toBe("proposal.pdf");
    expect(documentFilename("../../reports/budget.pdf")).toBe("budget.pdf");
    expect(documentFilename("C:\\files\\budget.pdf")).toBe("budget.pdf");
    expect(documentFilename("  quarterly\u0000 report.pdf  ")).toBe("quarterly report.pdf");
    expect(documentFilename("line\nbudget.pdf")).toBe("linebudget.pdf");
  });

  it("truncates to 200 characters and substitutes an empty name", () => {
    const emoji = "🙂".repeat(201);
    expect(documentFilename(emoji)).toBe("🙂".repeat(200));
    expect(documentFilename("   ")).toBe("document.pdf");
    expect(documentFilename("///")).toBe("document.pdf");
    expect(documentFilename("\u0000")).toBe("document.pdf");
  });
});

describe("document notes", () => {
  it("stores a trimmed note and treats a blank note as none", () => {
    expect(documentNote(undefined)).toEqual({ ok: true, note: null });
    expect(documentNote("   ")).toEqual({ ok: true, note: null });
    expect(documentNote("  See page  ")).toEqual({ ok: true, note: "See page" });
  });

  it("counts Unicode characters and rejects a note past 2,000", () => {
    expect(documentNote("a".repeat(2000))).toEqual({ ok: true, note: "a".repeat(2000) });
    expect(documentNote("🙂".repeat(2000))).toEqual({ ok: true, note: "🙂".repeat(2000) });
    expect(documentNote(`${"a".repeat(2000)} `)).toEqual({ ok: true, note: "a".repeat(2000) });
    expect(documentNote("a".repeat(2001))).toEqual({ ok: false, error: "note_too_long" });
    expect(documentNote("🙂".repeat(2001))).toEqual({ ok: false, error: "note_too_long" });
  });
});

describe("PDF bytes", () => {
  it("accepts a file that starts with the PDF header through 20 MiB", () => {
    expect(inspectPdfBytes(header)).toEqual({ ok: true });
    const full = new Uint8Array(maxDocumentBytes);
    full.set(header);
    expect(inspectPdfBytes(full)).toEqual({ ok: true });
  });

  it("rejects an oversized file before treating it as a PDF, and other files as not a PDF", () => {
    const oversized = new Uint8Array(maxDocumentBytes + 1);
    expect(inspectPdfBytes(oversized)).toEqual({ ok: false, error: "too_large" });
    oversized.set(header);
    expect(inspectPdfBytes(oversized)).toEqual({ ok: false, error: "too_large" });
    expect(inspectPdfBytes(new Uint8Array())).toEqual({ ok: false, error: "not_pdf" });
    expect(inspectPdfBytes(new TextEncoder().encode("%PDF"))).toEqual({
      ok: false,
      error: "not_pdf",
    });
    expect(inspectPdfBytes(new TextEncoder().encode("hello"))).toEqual({
      ok: false,
      error: "not_pdf",
    });
  });
});

describe("document pages", () => {
  it("accepts only an integer page inside the version", () => {
    expect(documentPage(1, 1)).toBe(true);
    expect(documentPage(3, 3)).toBe(true);
    expect(documentPage(0, 3)).toBe(false);
    expect(documentPage(4, 3)).toBe(false);
    expect(documentPage(1.5, 3)).toBe(false);
    expect(documentPage(-1, 3)).toBe(false);
  });
});

describe("base64 documents", () => {
  it("round-trips bytes, including a value larger than one chunk", () => {
    const bytes = new Uint8Array(0x8001);
    bytes[0] = 0x25;
    bytes[0x7fff] = 0xff;
    bytes[0x8000] = 0x41;
    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    expect(encodeBase64(new Uint8Array())).toBe("");
    expect(decodeBase64("")).toEqual(new Uint8Array());
  });

  it("rejects base64 that cannot be decoded", () => {
    expect(decodeBase64("abcde")).toBeNull();
    expect(decodeBase64("%%%%")).toBeNull();
  });
});

describe("assembling documents", () => {
  const version = (role: "proposal" | "budget", number: number): DocumentVersionRecord => ({
    role,
    version: number,
    filename: `${role}-${number}.pdf`,
    pageCount: number,
    byteSize: 12,
    recorderUserId: "dana",
    recorderName: "Dana Reed",
    recordedAt: "2027-02-01T00:00:00.000Z",
  });

  const citation = (
    id: string,
    role: "proposal" | "budget",
    recordedAt: string,
  ): DocumentCitationRecord => ({
    id,
    role,
    version: 1,
    page: 1,
    note: id,
    recorderUserId: "dana",
    recorderName: "Dana Reed",
    recordedAt,
  });

  it("returns empty slots when nothing is attached", () => {
    expect(assembleApplicationDocuments([], [], [])).toEqual(emptyApplicationDocuments());
  });

  it("lists versions and citations newest first and marks the current version on each citation", () => {
    const documents = assembleApplicationDocuments(
      [
        { role: "proposal", currentVersion: 2 },
        { role: "budget", currentVersion: 1 },
      ],
      [version("proposal", 1), version("budget", 1), version("proposal", 2)],
      [
        citation("aaaaaaaaaaaa", "proposal", "2027-02-02T00:00:00.000Z"),
        citation("cccccccccccc", "proposal", "2027-02-03T00:00:00.000Z"),
        citation("bbbbbbbbbbbb", "proposal", "2027-02-03T00:00:00.000Z"),
        citation("dddddddddddd", "budget", "2027-02-01T00:00:00.000Z"),
      ],
    );

    expect(documents.proposal.versions.map((item) => item.version)).toEqual([2, 1]);
    expect(documents.proposal.versions[0]).toMatchObject({
      filename: "proposal-2.pdf",
      recorder: { userId: "dana", name: "Dana Reed" },
    });
    expect(documents.proposal.citations.map((item) => item.id)).toEqual([
      "cccccccccccc",
      "bbbbbbbbbbbb",
      "aaaaaaaaaaaa",
    ]);
    expect(documents.proposal.citations[0]?.currentVersion).toBe(2);
    expect(documents.budget.currentVersion).toBe(1);
    expect(documents.budget.citations).toHaveLength(1);
  });

  it("drops a citation whose slot has no version", () => {
    const documents = assembleApplicationDocuments(
      [],
      [],
      [citation("aaaaaaaaaaaa", "proposal", "2027-02-02T00:00:00.000Z")],
    );
    expect(documents.proposal.citations).toEqual([]);
  });
});
