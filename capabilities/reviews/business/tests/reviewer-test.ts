import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { applicationTest } from "@merit/applications/testing";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { noContactGrantWork } from "@merit/contacts/testing";
import { actor } from "@merit/organizations/testing/workspace";
import type { ReviewerMessage } from "@merit/reviews/api";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { createInlineReviewerService } from "@merit/reviews/testing";
import { criteriaVersionSchema } from "@merit/rounds/domain";

export const sam = { userId: "sam" };
// One restricted runtime role serves the whole file.
export const reviewerTest = applicationTest
  .extend("runtimeUrl", { scope: "file" }, async ({ database }) =>
    database.createRuntimeConnection(),
  )
  .extend("reviewerScenario", async ({ db, database, applications }) => {
    await database.client.query(
      "INSERT INTO app_users (id, name, clerk_user_id) VALUES ('sam','Sam Morgan','sam-account'), ('other','Other','other-account')",
    );
    await database.client.query(
      "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', 'sam', 'sam@example.test', 'reviewer')",
    );
    const address = await applications.createApplication("Community review");
    const created = await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug: "alder",
        action: "create",
        contactId: randomUUID(),
        details: { name: "Sam Morgan", email: "sam@example.test", affiliation: "" },
      },
      noContactGrantWork,
    );
    assert(created.status === "ok");

    const requestReview = async (application: typeof address) => {
      const requestId = randomUUID();
      expect(
        await saveApplicationReview(db, actor, {
          ...application,
          expectedRevision: reviewRevisionSchema.parse(0),
          expectedApplicationVersion: materialVersionSchema.parse(1),
          expectedCriteriaVersion: criteriaVersionSchema.parse(1),
          change: {
            action: "request",
            id: requestId,
            contactId: created.contact.id,
            replacesId: null,
          },
        }),
      ).toMatchObject({ status: "ok" });
      return requestId;
    };

    const requestId = await requestReview(address);
    const messages: ReviewerMessage[] = [];
    let failDelivery = false;
    const service = createInlineReviewerService({
      database: async (operation) => operation(db),
      send: async (message) => {
        if (failDelivery) {
          throw new Error("Sender unavailable");
        }
        messages.push(message);
      },
      reviewerUrl: (slug, id) => `https://merit.test/app/${slug}/work/${id}`,
      managerUrl: (slug, id) => `https://merit.test/app/${slug}/applications/${id}`,
    });
    const invitation = { ...address, requestId, commandId: randomUUID(), dueDate: "2020-01-01" };
    const invited = await service.invite(actor, invitation);
    assert(invited.status === "ok", JSON.stringify(invited));
    const assignmentId = invited.value.id;

    const read = async () => {
      const result = await service.read(sam, { assignmentId });
      assert(result.status === "ok");
      return result.value;
    };

    const respond = async (action: "accept" | "decline" | "report_conflict", note = "") =>
      service.respond(sam, {
        assignmentId,
        commandId: randomUUID(),
        expectedRevision: (await read()).assignment.revision,
        action,
        note,
      });

    const manage = async (
      action: "cancel" | "reinstate" | "clear_conflict" | "resend" | "retry_notification",
      note = "",
    ) => {
      const list = await service.forApplication(actor, address);
      assert(list.status === "ok");
      const current = list.value.find((value) => value.id === assignmentId);
      assert.isDefined(current);
      return service.manage(actor, {
        ...address,
        assignmentId,
        commandId: randomUUID(),
        expectedRevision: current.revision,
        action,
        note,
      });
    };

    const save = async (reasoning = "Evidence supports the proposed work", note = "") => {
      const page = await read();
      assert(page.draft);
      return service.saveDraft(sam, {
        assignmentId,
        commandId: randomUUID(),
        expectedDraftRevision: page.draft.revision,
        draft: { position: "Fund", amount: "40.00", reasoning, observations: [], note },
      });
    };

    const submit = async () => {
      const page = await read();
      assert(page.draft);
      return service.submit(sam, {
        assignmentId,
        commandId: randomUUID(),
        expectedDraftRevision: page.draft.revision,
      });
    };

    return {
      service,
      assignmentId,
      address,
      invitation,
      messages,
      read,
      respond,
      manage,
      save,
      submit,
      requestId,
      requestReview,
      setDeliveryFailure: (value: boolean) => {
        failDelivery = value;
      },
    };
  });
