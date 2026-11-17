import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { assert, expect } from "vite-plus/test";

import { encodeBase64, maxDocumentBytes } from "@merit/applications/domain";
import {
  attachApplicationDocument,
  citeApplicationDocumentPage,
  createFundingApplication,
  editFundingApplication,
  listApplicationDocuments,
  readApplicationDocumentFile,
} from "@merit/applications/server";
import { getFundingApplicationPage, listWorkspaceActivity } from "@merit/grantmaking/server";
import { actor, workspaceSlug, workspaceTest as it } from "@merit/organizations/testing/workspace";
import { createFundingRound } from "@merit/rounds/server";

import { applicationWork } from "../src/server/persistence/commands/application-work";
import { withAuditFailure, recordedEvents } from "./audit-events";
import { pdfBytes } from "./pdf-document";

const setup = async (db: NodePgDatabase) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    title: "Document round",
    requestId: randomUUID(),
  });
  if (round.status !== "ok") {
    throw new Error("Round creation failed");
  }
  const created = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    title: "Community meals",
    requestId: randomUUID(),
  });
  if (created.status !== "ok") {
    throw new Error("Application creation failed");
  }
  const address = { workspaceSlug, publicId: created.publicId };

  const read = async () => (await getFundingApplicationPage(db, actor, address))!;

  return { address, read };
};

const file = (name: string, pages = 2) => ({
  filename: name,
  contentBase64: encodeBase64(pdfBytes(pages)),
});

it("attaches versioned proposal and budget PDFs without changing intake or review basis", async ({
  db,
  database,
}) => {
  const { address, read } = await setup(db);
  const before = await read();
  const proposal = file("../../notes/Community meals.pdf");
  const first = await attachApplicationDocument(db, actor, {
    ...address,
    role: "proposal",
    ...proposal,
    expectedVersion: 0,
  });
  assert(first.status === "ok");
  expect(first.version).toBe(1);
  expect(first.documents.proposal.currentVersion).toBe(1);
  expect(first.documents.proposal.versions[0]).toMatchObject({
    version: 1,
    filename: "Community meals.pdf",
    pageCount: 2,
    recorder: { userId: "dana", name: "Dana Reed" },
  });
  expect(first.documents.budget.currentVersion).toBeNull();

  const after = await read();
  expect(after.intake.revision).toBe(before.intake.revision);
  expect(after.application.version).toBe(before.application.version);
  expect(after.application.summary).toBe(before.application.summary);
  expect(after.intake.history).toEqual(before.intake.history);
  expect(after.documents.proposal.versions).toEqual(first.documents.proposal.versions);

  expect(
    await attachApplicationDocument(db, actor, {
      ...address,
      role: "proposal",
      ...proposal,
      expectedVersion: 0,
    }),
  ).toEqual({ status: "conflict" });
  expect(
    (
      await database.client.query<{ count: string }>(
        "SELECT count(*) FROM source_document_versions WHERE case_id = $1",
        [address.publicId],
      )
    ).rows[0]?.count,
  ).toBe("1");

  const second = await attachApplicationDocument(db, actor, {
    ...address,
    role: "proposal",
    ...proposal,
    expectedVersion: 1,
  });
  assert(second.status === "ok");
  expect(second.version).toBe(2);
  const stored = await database.client.query<{ version: number; content: Buffer }>(
    "SELECT version, content FROM source_document_versions WHERE case_id = $1 AND role = 'proposal' ORDER BY version",
    [address.publicId],
  );
  expect(stored.rows).toHaveLength(2);
  expect(Buffer.compare(stored.rows[0]!.content, stored.rows[1]!.content)).toBe(0);

  const budget = await attachApplicationDocument(db, actor, {
    ...address,
    role: "budget",
    filename: "  budget\u0000.pdf ",
    contentBase64: encodeBase64(pdfBytes(3)),
    expectedVersion: 0,
  });
  assert(budget.status === "ok");
  expect(budget.documents.budget.versions[0]?.filename).toBe("budget.pdf");
  expect(budget.documents.budget.versions[0]?.pageCount).toBe(3);

  const cited = await citeApplicationDocumentPage(db, actor, {
    ...address,
    role: "proposal",
    version: 1,
    page: 2,
    note: "  Weekly meals  ",
  });
  assert(cited.status === "ok");
  const citation = cited.documents.proposal.citations[0];
  expect(citation).toMatchObject({
    id: cited.citationId,
    role: "proposal",
    version: 1,
    page: 2,
    note: "Weekly meals",
    currentVersion: 2,
  });
  const blank = await citeApplicationDocumentPage(db, actor, {
    ...address,
    role: "proposal",
    version: 1,
    page: 1,
    note: "   ",
  });
  assert(blank.status === "ok");
  expect(blank.documents.proposal.citations[0]?.note).toBeNull();
  expect(blank.documents.proposal.citations[1]?.note).toBe("Weekly meals");

  const newer = await attachApplicationDocument(db, actor, {
    ...address,
    role: "proposal",
    filename: "proposal-v3.pdf",
    contentBase64: encodeBase64(pdfBytes(2)),
    expectedVersion: 2,
  });
  assert(newer.status === "ok");
  expect(
    newer.documents.proposal.citations.find((item) => item.id === cited.citationId),
  ).toMatchObject({
    version: 1,
    page: 2,
    note: "Weekly meals",
    currentVersion: 3,
  });

  const bytes = await readApplicationDocumentFile(db, actor, {
    ...address,
    role: "proposal",
    version: 1,
  });
  assert(bytes.status === "ok");
  expect(bytes.contentBase64).toBe(proposal.contentBase64);
  expect(bytes.filename).toBe("Community meals.pdf");
  expect(
    await readApplicationDocumentFile(db, actor, { ...address, role: "proposal", version: 9 }),
  ).toEqual({ status: "invalid", error: "version_not_found" });

  const details = await database.client.query<{
    action: string;
    details: {
      citationId?: string;
      role?: string;
      version?: number;
      page?: number;
      note?: string | null;
    };
  }>(
    "SELECT action, details FROM audit_events WHERE target_type = 'application_document' AND target_id = $1 ORDER BY action, recorded_at",
    [address.publicId],
  );
  expect(details.rows.map((row) => row.action)).toEqual([
    "application.document.attach",
    "application.document.attach",
    "application.document.attach",
    "application.document.attach",
    "application.document.cite",
    "application.document.cite",
  ]);
  expect(JSON.stringify(details.rows)).not.toContain("contentBase64");
  expect(
    details.rows.find((row) => row.action === "application.document.cite")?.details,
  ).toMatchObject({
    citationId: cited.citationId,
    role: "proposal",
    version: 1,
    page: 2,
    note: "Weekly meals",
  });
  expect(await recordedEvents(database.client, "target_type = 'application'")).not.toEqual(
    expect.arrayContaining([expect.stringContaining("application.document")]),
  );

  const activity = await listWorkspaceActivity(db, actor, { workspaceSlug });
  assert(activity.status === "ok");
  expect(
    activity.entries.find((entry) => entry.action === "application.document.attach"),
  ).toMatchObject({
    documentRole: "proposal",
  });
  expect(
    activity.entries.find((entry) => entry.action === "application.document.cite"),
  ).toMatchObject({
    documentRole: "proposal",
  });
});

it("rejects a document that is not a readable PDF of at most 20 MB and writes nothing", async ({
  db,
  database,
}) => {
  const { address } = await setup(db);

  const versions = async () =>
    (
      await database.client.query<{ count: string }>(
        "SELECT count(*) FROM source_document_versions",
      )
    ).rows[0]?.count;

  expect(
    await attachApplicationDocument(db, actor, {
      ...address,
      role: "proposal",
      filename: "notes.txt",
      contentBase64: encodeBase64(new TextEncoder().encode("hello")),
      expectedVersion: 0,
    }),
  ).toEqual({ status: "invalid", error: "not_pdf" });
  const oversized = new Uint8Array(maxDocumentBytes + 1);
  oversized.set(new TextEncoder().encode("%PDF-"));
  expect(
    await attachApplicationDocument(db, actor, {
      ...address,
      role: "proposal",
      filename: "huge.pdf",
      contentBase64: encodeBase64(oversized),
      expectedVersion: 0,
    }),
  ).toEqual({ status: "invalid", error: "too_large" });
  expect(
    await attachApplicationDocument(db, actor, {
      ...address,
      role: "proposal",
      filename: "broken.pdf",
      contentBase64: encodeBase64(new TextEncoder().encode("%PDF-1.4\nnot a pdf")),
      expectedVersion: 0,
    }),
  ).toEqual({ status: "invalid", error: "unreadable_pdf" });
  expect(await versions()).toBe("0");
  expect(
    (
      await database.client.query<{ count: string }>(
        "SELECT count(*) FROM audit_events WHERE action = 'application.document.attach'",
      )
    ).rows[0]?.count,
  ).toBe("0");
});

it("keeps page references inside the cited version and rolls back when the audit record fails", async ({
  db,
  database,
}) => {
  const { address } = await setup(db);
  const attached = await attachApplicationDocument(db, actor, {
    ...address,
    role: "budget",
    filename: "budget.pdf",
    contentBase64: encodeBase64(pdfBytes(2)),
    expectedVersion: 0,
  });
  assert(attached.status === "ok");
  expect(
    await citeApplicationDocumentPage(db, actor, {
      ...address,
      role: "budget",
      version: 1,
      page: 3,
    }),
  ).toEqual({ status: "invalid", error: "page_out_of_range" });
  expect(
    await citeApplicationDocumentPage(db, actor, {
      ...address,
      role: "budget",
      version: 4,
      page: 1,
    }),
  ).toEqual({ status: "invalid", error: "version_not_found" });
  expect(
    await citeApplicationDocumentPage(db, actor, {
      ...address,
      role: "budget",
      version: 1,
      page: 1,
      note: "a".repeat(2001),
    }),
  ).toEqual({ status: "invalid", error: "note_too_long" });
  expect(
    await citeApplicationDocumentPage(db, actor, {
      ...address,
      role: "budget",
      version: 1,
      page: 1,
      note: "a".repeat(2000),
    }),
  ).toMatchObject({ status: "ok" });
  expect(
    (
      await database.client.query<{ count: string }>(
        "SELECT count(*) FROM source_document_citations",
      )
    ).rows[0]?.count,
  ).toBe("1");

  await expect(
    withAuditFailure(database.client, () =>
      attachApplicationDocument(db, actor, {
        ...address,
        role: "budget",
        filename: "next.pdf",
        contentBase64: encodeBase64(pdfBytes(1)),
        expectedVersion: 1,
      }),
    ),
  ).rejects.toMatchObject({ cause: { message: "Audit recording failed" } });
  expect(
    (
      await database.client.query<{ current_version: number }>(
        "SELECT current_version FROM source_documents WHERE role = 'budget'",
      )
    ).rows,
  ).toEqual([{ current_version: 1 }]);
});

it("hides documents from another organization, keeps them readable after withdrawal, and deletes them with the case", async ({
  db,
  database,
}) => {
  const { address, read } = await setup(db);
  const attached = await attachApplicationDocument(db, actor, {
    ...address,
    role: "proposal",
    filename: "proposal.pdf",
    contentBase64: encodeBase64(pdfBytes(1)),
    expectedVersion: 0,
  });
  assert(attached.status === "ok");
  const cited = await citeApplicationDocumentPage(db, actor, {
    ...address,
    role: "proposal",
    version: 1,
    page: 1,
  });
  assert(cited.status === "ok");

  const outsider = { userId: "birch-manager" };
  expect(await listApplicationDocuments(db, outsider, address)).toEqual({ status: "not_found" });
  expect(
    await attachApplicationDocument(db, outsider, {
      ...address,
      role: "budget",
      filename: "budget.pdf",
      contentBase64: encodeBase64(pdfBytes(1)),
      expectedVersion: 0,
    }),
  ).toEqual({ status: "not_found" });

  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: (await read()).intake.revision,
        change: { action: "withdraw", withdrawnOn: "2026-11-01", reason: "Paused" },
      },
      applicationWork,
    ),
  ).toMatchObject({ status: "ok" });
  expect((await listApplicationDocuments(db, actor, address)).status).toBe("ok");
  expect(
    await attachApplicationDocument(db, actor, {
      ...address,
      role: "budget",
      filename: "budget.pdf",
      contentBase64: encodeBase64(pdfBytes(1)),
      expectedVersion: 0,
    }),
  ).toEqual({ status: "invalid", error: "application_withdrawn" });
  expect(
    await citeApplicationDocumentPage(db, actor, {
      ...address,
      role: "proposal",
      version: 1,
      page: 1,
    }),
  ).toEqual({ status: "invalid", error: "application_withdrawn" });

  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: (await read()).intake.revision,
        change: { action: "reinstate", reason: "Resumed" },
      },
      applicationWork,
    ),
  ).toMatchObject({ status: "ok" });
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: (await read()).intake.revision,
        change: { action: "delete" },
      },
      applicationWork,
    ),
  ).toMatchObject({ status: "ok" });
  for (const table of [
    "source_documents",
    "source_document_versions",
    "source_document_citations",
  ]) {
    expect(
      (await database.client.query<{ count: string }>(`SELECT count(*) FROM ${table}`)).rows[0]
        ?.count,
    ).toBe("0");
  }
  expect(
    (
      await database.client.query<{ count: string }>(
        "SELECT count(*) FROM audit_events WHERE action = 'application.document.attach'",
      )
    ).rows[0]?.count,
  ).toBe("1");
});
