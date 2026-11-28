import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import type { IntakeChange } from "@merit/applications/domain";
import { readMaterialVersionRecord } from "@merit/applications/scope";
import {
  createFundingApplication,
  editFundingApplication,
  readManagerApplicationPdf,
  registerApplicationPdf,
  applicationPdfUploadAccess,
} from "@merit/applications/server";
import { actor } from "@merit/organizations/testing/workspace";

import { applicationTest as it, noApplicationWork } from "./application-test";
import { readPersistedApplication } from "./persisted-application";

const upload = (filename: string) => ({
  filename,
  reference: { objectKey: `files/${randomUUID()}`, byteLength: 18, sha256: "a".repeat(64) },
  sample: false,
});

it("claims creation uploads once in the same transaction and retains each version's exact PDF", async ({
  db,
  rounds,
}) => {
  const target = { workspaceSlug: "alder", roundId: rounds.pageInput.publicId };
  const initial = upload("Budget.pdf");
  const pdf = await registerApplicationPdf(db, actor, target, initial);
  assert(pdf);
  expect(await applicationPdfUploadAccess(db, { userId: "birch-manager" }, target)).toBeNull();
  const input = {
    workspaceSlug: target.workspaceSlug,
    publicId: target.roundId,
    requestId: randomUUID(),
    title: "Soup kitchen",
    pdfs: [pdf],
  };
  const created = await createFundingApplication(db, actor, input);
  assert(created.status === "ok");
  expect(await createFundingApplication(db, actor, input)).toEqual(created);
  expect(
    await createFundingApplication(db, actor, { ...input, requestId: randomUUID() }),
  ).toMatchObject({ status: "invalid" });
  const address = { workspaceSlug: "alder", publicId: created.publicId };

  const edit = async (change: IntakeChange) => {
    const state = await readPersistedApplication(db, created.publicId);
    assert(state);
    return editFundingApplication(
      db,
      actor,
      { ...address, expectedRevision: state.revision, change },
      noApplicationWork,
    );
  };

  expect(await edit({ action: "mark_ready" })).toMatchObject({
    status: "invalid",
    error: "incomplete_application",
  });
  expect(
    await edit({
      action: "save_content",
      content: {
        applicant: "Kitchen",
        requested: "100",
        answers: [{ questionId: randomUUID(), question: "Project", response: "Meals" }],
      },
    }),
  ).toMatchObject({ status: "ok" });
  expect(await edit({ action: "mark_ready" })).toMatchObject({ status: "ok" });
  const caseTarget = { workspaceSlug: "alder", applicationId: created.publicId };
  expect(await applicationPdfUploadAccess(db, actor, caseTarget)).toBeNull();
  expect(await edit({ action: "start_revision", kind: "revision" })).toMatchObject({
    status: "ok",
  });
  const revisionPdf = await registerApplicationPdf(
    db,
    actor,
    caseTarget,
    upload("Revised budget.pdf"),
  );
  assert(revisionPdf);
  expect(
    await edit({
      action: "save_revision",
      draft: {
        kind: "revision",
        reason: "Revised budget received",
        content: { pdfs: [revisionPdf] },
      },
    }),
  ).toMatchObject({ status: "ok" });
  const draft = await readPersistedApplication(db, created.publicId);
  expect(draft?.application.submission?.pdfs).toEqual([pdf]);
  expect(draft?.workingRevision?.content.pdfs).toEqual([revisionPdf]);
  expect(await edit({ action: "publish_revision" })).toMatchObject({ status: "ok" });
  const recorded = await readPersistedApplication(db, created.publicId);
  expect(recorded?.application.submission?.pdfs).toEqual([revisionPdf]);
  expect(recorded?.history[0]?.details).toMatchObject({
    before: { application: { submission: { pdfs: [pdf] } } },
    after: { application: { submission: { pdfs: [revisionPdf] } } },
  });
  expect(
    (await readMaterialVersionRecord(db, created.publicId, 1))?.content.submission?.pdfs,
  ).toEqual([pdf]);
  expect(await readManagerApplicationPdf(db, actor, { ...caseTarget, id: pdf.id })).toEqual({
    filename: initial.filename,
    reference: initial.reference,
  });
});

it("rejects forged metadata and files staged for other managers or cases", async ({
  db,
  database,
  applications,
}) => {
  const first = await applications.createApplication("First proposal");
  const second = await applications.createApplication("Second proposal");
  const target = { workspaceSlug: "alder", applicationId: first.publicId };
  await database.client.query(
    "INSERT INTO memberships (organization_id,user_id,email,role) VALUES ('alder','birch-manager','manager@example.test','program_manager')",
  );
  const pdf = await registerApplicationPdf(db, actor, target, upload("Budget.pdf"));
  assert(pdf);
  const command = {
    ...first,
    expectedRevision: 0,
    change: { action: "save_content", content: { pdfs: [pdf] } },
  } as const;

  const attach = (user: typeof actor, caseId: string, filename: string) =>
    editFundingApplication(
      db,
      user,
      {
        ...command,
        publicId: caseId,
        change: { ...command.change, content: { pdfs: [{ ...pdf, filename }] } },
      },
      noApplicationWork,
    );

  const other = { userId: "birch-manager" };
  expect(await readManagerApplicationPdf(db, other, { ...target, id: pdf.id })).toBeNull();
  expect(await attach(other, first.publicId, pdf.filename)).toMatchObject({ status: "invalid" });
  expect(await attach(actor, second.publicId, pdf.filename)).toMatchObject({ status: "invalid" });
  expect(await attach(actor, first.publicId, "Wrong.pdf")).toMatchObject({ status: "invalid" });
  expect(await attach(actor, first.publicId, pdf.filename)).toMatchObject({ status: "ok" });
  expect(await readManagerApplicationPdf(db, other, { ...target, id: pdf.id })).toMatchObject({
    filename: pdf.filename,
  });
});
