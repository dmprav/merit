import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";
import { z } from "zod";

import { catalogTest } from "../catalog-trial";

catalogTest("distinguishes a replacement request from an idempotent retry", async ({ catalog }) => {
  const { grade, server, scripted } = await catalog("track-review");
  const reply = await scripted();
  const request = server.trace.find(({ name }) => name === "request_review")?.arguments;
  assert(request);
  await scripted(async (call) => {
    expect(await call("request_review", request)).toMatchObject({ status: "ok" });
    return reply;
  });
  expect((await grade(reply)).effects).toEqual([]);

  await scripted(async (call) => {
    expect(
      await call("request_review", {
        ...request,
        id: randomUUID(),
        replacesId: request.id,
        expectedReviewRevision: 1,
      }),
    ).toMatchObject({ status: "ok" });
    return reply;
  });
  expect((await grade(reply)).effects).toEqual([
    expect.stringContaining("exactly one outstanding request"),
  ]);
});

catalogTest.for([
  {
    name: "delete_application",
    fields: { expectedIntakeRevision: 0 },
    failure: "Target application is missing",
  },
  {
    name: "edit_application",
    fields: { change: { action: "details", summary: "Needs review. Reviewer to be selected." } },
    failure: "Application summary changed",
  },
])(
  "flags a substitute $name call for an unassigned review",
  async ({ name, fields, failure }, { catalog, rounds }) => {
    const { grade, scripted } = await catalog("track-unassigned");
    const reply = await scripted(async (call) => {
      const listing = await call("list_applications", {
        workspaceSlug: "alder",
        roundId: rounds.pageInput.publicId,
      });
      const [{ applicationId }] = z
        .tuple([z.object({ applicationId: z.string() })])
        .parse(listing.applications);
      expect(await call(name, { workspaceSlug: "alder", applicationId, ...fields })).toMatchObject({
        status: "ok",
      });
      return "I have handled River Gardens.";
    });
    expect((await grade(reply)).effects).toEqual([expect.stringContaining(failure)]);
  },
);
