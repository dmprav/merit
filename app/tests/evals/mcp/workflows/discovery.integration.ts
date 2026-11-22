import { expect } from "vite-plus/test";

import { catalogTest } from "../catalog-trial";

catalogTest("checks the destination of the Eastside application link", async ({ catalog }) => {
  const { scripted, server, grade } = await catalog("find-application");
  const reply = await scripted();
  const path = reply.slice(reply.indexOf("/app/"));
  expect((await grade(reply)).reply.status).toBe("passed");
  expect((await grade("[Harbor Mural](" + new URL(path, server.url).href + ")")).reply.status).toBe(
    "passed",
  );
  expect((await grade("[" + path + "](https://example.test" + path + ")")).reply.status).toBe(
    "failed",
  );
});

catalogTest("ties round activity to the actor and its place in history", async ({ catalog }) => {
  const { grade, scripted } = await catalog("recent-activity");
  expect((await grade(await scripted())).reply.status).toBe("partial");
  expect(
    (await grade("First Mina updated the budget, then Dana renamed the round.")).reply.status,
  ).toBe("partial");
  expect((await grade("Dana updated the budget. Mina renamed the round.")).reply.status).toBe(
    "failed",
  );
  expect((await grade("Dana renamed the round before Mina updated the budget.")).reply.status).toBe(
    "failed",
  );
});

catalogTest("rejects a denial that cites Priya’s email", async ({ catalog }) => {
  const { grade, scripted } = await catalog("find-email");
  expect((await grade(await scripted())).reply.status).toBe("passed");
  expect((await grade("Priya emailed to say her site visit was postponed.")).reply.status).toBe(
    "passed",
  );
  expect((await grade("No. Priya wrote that her site visit was postponed.")).reply.status).toBe(
    "failed",
  );
});

catalogTest("rejects a claim that Jo’s invitation was sent", async ({ catalog }) => {
  const { grade, scripted } = await catalog("invitation-status");
  expect((await grade(await scripted())).reply.status).toBe("partial");
  expect((await grade("Priya’s invitation failed. Jo was not invited.")).reply.status).toBe(
    "partial",
  );
  expect(
    (await grade("Priya’s invitation failed. No invitation was sent to Jo.")).reply.status,
  ).toBe("partial");
  expect(
    (await grade("Priya’s invitation failed. Jo’s invitation was sent successfully.")).reply.status,
  ).toBe("failed");
});

catalogTest(
  "distinguishes the outstanding reviewer from the stale assessor",
  async ({ catalog }) => {
    const { grade, scripted } = await catalog("review-overview");
    expect((await grade(await scripted())).reply.status).toBe("passed");
    expect(
      (await grade("Outstanding review: Priya. Assessment using older material: Jo.")).reply.status,
    ).toBe("passed");
    expect(
      (await grade("Jo’s assessment is current. Priya’s assessment uses old material.")).reply
        .status,
    ).toBe("failed");
  },
);
