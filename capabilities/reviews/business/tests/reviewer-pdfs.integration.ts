import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import {
  createFundingApplication,
  editFundingApplication,
  registerApplicationPdf,
} from "@merit/applications/server";
import { noApplicationWork } from "@merit/applications/testing";
import { withDatabase } from "@merit/db";
import { actor } from "@merit/organizations/testing/workspace";
import { readReviewerApplicationPdf } from "@merit/reviews/server";

import { reviewerTest as it, sam } from "./reviewer-test";

const budget = () => ({
  filename: "Budget.pdf",
  sample: false,
  reference: { objectKey: `files/${randomUUID()}`, sha256: "b".repeat(64), byteLength: 23 },
});

it("serves only PDFs on the accepted assignment's pinned version while reviewer access remains active", async ({
  runtimeUrl,
  rounds,
  database,
  reviewerScenario: s,
}) => {
  await withDatabase(runtimeUrl, async (db) => {
    const workspaceSlug = "alder";
    const original = budget();
    const pdf = await registerApplicationPdf(
      db,
      actor,
      { workspaceSlug, roundId: rounds.pageInput.publicId },
      original,
    );
    assert(pdf);
    const created = await createFundingApplication(db, actor, {
      workspaceSlug,
      publicId: rounds.pageInput.publicId,
      requestId: randomUUID(),
      title: "Versioned proposal",
      pdfs: [pdf],
    });
    assert(created.status === "ok");
    const address = { workspaceSlug, publicId: created.publicId };
    const requestId = await s.requestReview(address);
    await database.client.query(
      "UPDATE reviewer_messages SET created_at = now() - interval '2 minutes' WHERE assignment_id = $1",
      [s.assignmentId],
    );
    const invitation = await s.service.invite(actor, {
      ...address,
      requestId,
      commandId: randomUUID(),
      dueDate: null,
    });
    assert(invitation.status === "ok", JSON.stringify(invitation));
    const assignmentId = invitation.value.id;

    const read = (id: string) =>
      readReviewerApplicationPdf(db, sam, { workspaceSlug, assignmentId, id });

    expect(await read(pdf.id)).toBeNull();
    const accepted = await s.service.respond(sam, {
      workspaceSlug,
      assignmentId,
      commandId: randomUUID(),
      expectedRevision: invitation.value.revision,
      action: "accept",
      note: "",
    });
    assert(accepted.status === "ok");
    expect(await read(pdf.id)).toEqual({
      filename: original.filename,
      reference: original.reference,
    });

    const replacement = await registerApplicationPdf(
      db,
      actor,
      { workspaceSlug, applicationId: created.publicId },
      budget(),
    );
    assert(replacement);
    expect(
      await editFundingApplication(
        db,
        actor,
        {
          ...address,
          expectedRevision: 0,
          change: { action: "save_content", content: { pdfs: [replacement] } },
        },
        noApplicationWork,
      ),
    ).toMatchObject({ status: "ok" });
    expect(await read(replacement.id)).toBeNull();
    expect(await read(pdf.id)).toEqual({
      filename: original.filename,
      reference: original.reference,
    });
    const cancelled = await s.service.manage(actor, {
      ...address,
      assignmentId,
      commandId: randomUUID(),
      expectedRevision: accepted.value.revision,
      action: "cancel",
      note: "Assignment ended",
    });
    assert(cancelled.status === "ok");
    expect(await read(pdf.id)).toBeNull();
  });
});
