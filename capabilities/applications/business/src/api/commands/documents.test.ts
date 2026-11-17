import { describe, expect, it } from "vite-plus/test";

import { assembleApplicationDocuments } from "../../domain/documents";
import {
  applicationDocumentsSchema,
  attachApplicationDocumentInputSchema,
  citeApplicationDocumentInputSchema,
  listApplicationDocumentsInputSchema,
  readApplicationDocumentFileInputSchema,
} from "./documents";

const address = { workspaceSlug: "alder", publicId: "k7m2p9x4n6rt" };

describe("application document requests", () => {
  it("accepts a list, an attach, a citation, and a file read", () => {
    expect(listApplicationDocumentsInputSchema.parse(address)).toEqual(address);
    expect(
      attachApplicationDocumentInputSchema.parse({
        ...address,
        role: "proposal",
        filename: "",
        contentBase64: "JVBERi0=",
        expectedVersion: 0,
      }),
    ).toMatchObject({ role: "proposal", expectedVersion: 0 });
    expect(
      citeApplicationDocumentInputSchema.parse({
        ...address,
        role: "budget",
        version: 1.2,
        page: 0,
        note: "a".repeat(2001),
      }),
    ).toMatchObject({ version: 1.2, page: 0 });
    expect(
      readApplicationDocumentFileInputSchema.parse({ ...address, role: "budget", version: 2 }),
    ).toMatchObject({ version: 2 });
  });

  it("rejects a request that adds a field or names an unknown role", () => {
    expect(
      listApplicationDocumentsInputSchema.safeParse({ ...address, actor: "dana" }).success,
    ).toBe(false);
    expect(
      attachApplicationDocumentInputSchema.safeParse({
        ...address,
        role: "letter",
        filename: "letter.pdf",
        contentBase64: "",
        expectedVersion: 0,
      }).success,
    ).toBe(false);
    expect(
      citeApplicationDocumentInputSchema.safeParse({ ...address, role: "proposal", version: 1 })
        .success,
    ).toBe(false);
    expect(
      readApplicationDocumentFileInputSchema.safeParse({
        ...address,
        role: "proposal",
        version: 0,
      }).success,
    ).toBe(false);
  });
});

describe("application document results", () => {
  it("accepts assembled slots and rejects a version that carries file bytes", () => {
    const documents = assembleApplicationDocuments(
      [{ role: "proposal", currentVersion: 1 }],
      [
        {
          role: "proposal",
          version: 1,
          filename: "proposal.pdf",
          pageCount: 2,
          byteSize: 8,
          recorderUserId: "dana",
          recorderName: "Dana Reed",
          recordedAt: "2027-03-01T12:00:00.000Z",
        },
      ],
      [
        {
          id: "b8q3w5j7c2df",
          role: "proposal",
          version: 1,
          page: 2,
          note: null,
          recorderUserId: "dana",
          recorderName: "Dana Reed",
          recordedAt: "2027-03-01T12:05:00.000Z",
        },
      ],
    );

    expect(applicationDocumentsSchema.parse(documents)).toEqual(documents);
    expect(
      applicationDocumentsSchema.safeParse({
        ...documents,
        proposal: {
          ...documents.proposal,
          versions: [{ ...documents.proposal.versions[0], content: "bytes" }],
        },
      }).success,
    ).toBe(false);
  });
});
