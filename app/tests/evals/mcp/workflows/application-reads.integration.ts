import { expect } from "vite-plus/test";
import { z } from "zod";

import { catalogTest } from "../catalog-trial";

catalogTest(
  "requires observed evidence for an answer added after intake began",
  async ({ catalog }) => {
    const { scripted, server, grade } = await catalog("original-evidence-late");
    const reply = await scripted();
    const titleOnly = server.trace.filter((call) => call.arguments?.materialVersion === 1);
    expect(titleOnly).toHaveLength(1);
    expect((await grade(reply, titleOnly)).selection).toContainEqual(
      expect.stringContaining("original recorded passage"),
    );
    expect((await grade(reply)).selection).toEqual([]);
  },
);

catalogTest(
  "cannot open a revision if Merit omits the intake revision from the public read",
  async ({ catalog }) => {
    const { scripted, scenario, server } = await catalog("open-revision");
    await expect(
      scripted((call) =>
        scenario.control(async (name, args) => {
          const result = await call(name, args);
          if (name !== "get_application") {
            return result;
          }
          return {
            ...result,
            application: {
              ...z.record(z.string(), z.unknown()).parse(result.application),
              intakeRevision: undefined,
            },
          };
        }),
      ),
    ).rejects.toThrow();
    expect(server.trace.map((call) => call.name)).toContain("get_application");
    expect(server.trace.map((call) => call.name)).not.toContain("start_application_revision");
  },
);

catalogTest("grades the summary edit before the later material change", async ({ catalog }) => {
  const { grade, scripted } = await catalog("intake-changes");
  expect((await grade(await scripted())).reply.status).toBe("partial");
  expect(
    (await grade("The recorded material was updated after staff edited the summary.")).reply.status,
  ).toBe("partial");
  expect((await grade("Staff updated the material, then changed the summary.")).reply.status).toBe(
    "failed",
  );
  expect(
    (
      await grade(
        "Created with €2,000 requested. Staff edited the summary, then raised the amount to €2,400.",
      )
    ).reply.status,
  ).toBe("partial");
  expect(
    (await grade("The summary was changed after staff updated the material.")).reply.status,
  ).toBe("failed");
});

catalogTest("rejects a denial of the current submission’s ready status", async ({ catalog }) => {
  const { grade, scripted } = await catalog("current-material");
  expect((await grade(await scripted())).reply.status).toBe("passed");
  expect(
    (await grade("The current submission is ready (version 2). The open revision is not ready."))
      .reply.status,
  ).toBe("passed");
  expect(
    (
      await grade(
        "The working revision is ready but the current submission is not ready (version 2).",
      )
    ).reply.status,
  ).toBe("failed");
  expect(
    (await grade("Lanterns is not ready; its current submission is version 2.")).reply.status,
  ).toBe("failed");
});
