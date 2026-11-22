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
