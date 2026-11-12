import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { actor } from "@merit/organizations/testing/workspace";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { editFundingRound } from "@merit/rounds/server";

import { commandTest } from "./fixtures/mcp-command-test";

const it = commandTest.extend(
  "reviewScenario",
  async ({ db, rounds: { pageInput }, commands: { applicationScenario, createContact } }) =>
    async () => {
      const scenario = await applicationScenario();
      await scenario.change({ action: "save_content", content: { requested: "250.50" } });
      const contactId = await createContact();
      const read = scenario.read;
      for (const [expectedRevision, title] of ["Local benefit", "Community impact"].entries()) {
        const result = await editFundingRound(db, actor, {
          workspaceSlug: "alder",
          publicId: pageInput.publicId,
          expectedRevision,
          change: {
            section: "criteria",
            criteria: [{ id: "20000000-0000-4000-8000-000000000001", title, description: "" }],
          },
        });
        assert(result.status === "ok", "Could not prepare the MCP criteria history");
      }

      const args = async () => {
        const page = await read();
        return {
          workspaceSlug: "alder",
          applicationId: scenario.address.publicId,
          expectedReviewRevision: page.application.reviews.revision,
          expectedApplicationVersion: page.application.version,
          expectedCriteriaVersion: page.round.criteriaVersion,
        };
      };

      const review = async (change: Parameters<typeof saveApplicationReview>[2]["change"]) => {
        const input = await args();
        const result = await saveApplicationReview(db, actor, {
          ...scenario.address,
          expectedRevision: input.expectedReviewRevision,
          expectedApplicationVersion: input.expectedApplicationVersion,
          expectedCriteriaVersion: input.expectedCriteriaVersion,
          change,
        });
        assert(result.status === "ok", "Could not prepare the MCP review");
      };

      const content = {
        applicationVersion: materialVersionSchema.parse(1),
        criteriaVersion: criteriaVersionSchema.parse(2),
        date: "2026-11-09",
        position: "Fund" as const,
        amount: "200.50",
        reasoning: "Clear local benefit",
        observations: [{ criterionId: null, criterion: "Local benefit", text: "Shared meals" }],
      };
      return { read, args, review, contactId, content };
    },
);

it("replaces a review request with its evidence basis and authenticated author", async ({
  commands: { invoke },
  reviewScenario,
}) => {
  const scenario = await reviewScenario();
  const id = randomUUID();
  const previousId = randomUUID();
  await scenario.review({
    action: "request",
    id: previousId,
    contactId: scenario.contactId,
    replacesId: null,
  });
  const args = await scenario.args();

  expect(
    await invoke("request_review", {
      ...args,
      id,
      contactId: scenario.contactId,
      replacesId: previousId,
    }),
  ).toEqual({
    status: "ok",
    applicationId: args.applicationId,
    reviewRevision: 2,
  });
  expect((await scenario.read()).application.reviews.requests).toMatchObject([
    { id: previousId, status: "cancelled" },
    {
      id,
      contactId: scenario.contactId,
      applicationVersion: materialVersionSchema.parse(2),
      criteriaVersion: criteriaVersionSchema.parse(3),
      status: "outstanding",
      recorder: {
        userId: "dana",
        provenance: { interface: "mcp", clientId: "integration-client" },
      },
    },
  ]);
});

it("cancels the selected outstanding review request", async ({
  commands: { invoke },
  reviewScenario,
}) => {
  const scenario = await reviewScenario();
  const id = randomUUID();
  await scenario.review({
    action: "request",
    id,
    contactId: scenario.contactId,
    replacesId: null,
  });
  const args = await scenario.args();

  expect(await invoke("cancel_review_request", { ...args, id })).toEqual({
    status: "ok",
    applicationId: args.applicationId,
    reviewRevision: 2,
  });
  expect((await scenario.read()).application.reviews.requests).toMatchObject([
    { id, status: "cancelled" },
  ]);
});

it("records an assessment against the requested evidence versions", async ({
  commands: { invoke },
  reviewScenario,
}) => {
  const scenario = await reviewScenario();
  const id = randomUUID();
  const requestId = randomUUID();
  await scenario.review({
    action: "request",
    id: requestId,
    contactId: scenario.contactId,
    replacesId: null,
  });
  const args = await scenario.args();

  expect(
    await invoke("record_assessment", {
      ...args,
      id,
      contactId: scenario.contactId,
      requestId,
      previousId: null,
      content: scenario.content,
    }),
  ).toEqual({ status: "ok", applicationId: args.applicationId, reviewRevision: 2 });
  const saved = await scenario.read();
  expect(saved.application.reviews.requests).toMatchObject([{ id: requestId, status: "received" }]);
  expect(saved.application.reviews.assessments).toMatchObject([
    {
      id,
      requestId,
      contactId: scenario.contactId,
      versions: [
        {
          content: scenario.content,
          recorder: {
            userId: "dana",
            provenance: { interface: "mcp", clientId: "integration-client" },
          },
        },
      ],
    },
  ]);
});

it("corrects an assessment while retaining its previous content", async ({
  commands: { invoke },
  reviewScenario,
}) => {
  const scenario = await reviewScenario();
  const id = randomUUID();
  await scenario.review({
    action: "record",
    id,
    contactId: scenario.contactId,
    requestId: null,
    previousId: null,
    content: scenario.content,
  });
  const args = await scenario.args();
  const content = { ...scenario.content, amount: "210.50" };

  expect(
    await invoke("correct_assessment", {
      ...args,
      id,
      content,
      note: "Corrected reviewer amount",
    }),
  ).toEqual({
    status: "ok",
    applicationId: args.applicationId,
    reviewRevision: 2,
  });
  expect((await scenario.read()).application.reviews.assessments).toMatchObject([
    {
      id,
      versions: [{ content: scenario.content }, { content, note: "Corrected reviewer amount" }],
    },
  ]);
});

it.for([
  "expectedReviewRevision",
  "expectedApplicationVersion",
  "expectedCriteriaVersion",
] as const)(
  "rejects a review with a mismatched %s without recording it",
  async (version, { commands: { invoke }, reviewScenario }) => {
    const scenario = await reviewScenario();
    const args = await scenario.args();
    const before = await scenario.read();

    expect(
      await invoke("record_assessment", {
        ...args,
        [version]: args[version] + 1,
        id: randomUUID(),
        contactId: scenario.contactId,
        requestId: null,
        previousId: null,
        content: scenario.content,
      }),
    ).toEqual({ status: "conflict" });
    expect(await scenario.read()).toEqual(before);
  },
);
