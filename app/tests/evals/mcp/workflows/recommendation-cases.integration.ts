import { assert, expect } from "vite-plus/test";

import { catalogTest } from "../catalog-trial";

catalogTest(
  "checks the recommendation confirmation against the persisted date",
  async ({ catalog }) => {
    const { grade, scripted, server } = await catalog("recommend-from-evidence");
    const confirmation = await scripted();
    expect((await grade(confirmation)).reply.status).toBe("partial");
    const withoutGuard = server.trace.map((call) =>
      call.name === "save_recommendation"
        ? { ...call, arguments: { ...call.arguments, expectedCurrentAssessment: undefined } }
        : call,
    );
    expect((await grade(confirmation, withoutGuard)).selection.length).toBeGreaterThan(0);
    for (const reply of ["Recommendation saved.", "Recommendation recorded on 1999-04-05."]) {
      const result = (await grade(reply)).reply;
      assert(result.status === "failed");
      expect(result.issue).toContain("recording date");
    }
  },
);

catalogTest(
  "checks a recorded decision and keeps it apart from a recommendation",
  async ({ catalog }) => {
    const { scenario, grade, scripted } = await catalog("record-decision");
    const control = await scripted();
    const { verifyReply } = scenario;
    assert(verifyReply);
    await verifyReply(control);
    await expect(async () => verifyReply("Done.")).rejects.toThrow("recorded amount");
    await expect(async () =>
      verifyReply("I saved your recommendation of €2,450.25 for Lanterns."),
    ).rejects.toThrow("decision");
    expect((await grade(control)).effects).toEqual([]);
  },
);
