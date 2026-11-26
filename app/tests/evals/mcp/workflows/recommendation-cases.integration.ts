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
    for (const reply of [
      "I recorded the committee's decision to fund Lanterns with €2,450.25.",
      "Decision recorded: Fund, 2450.25 EUR.",
      "The funding decision was saved for € 2 450,25.",
    ]) {
      await verifyReply(reply);
    }
    await expect(async () => verifyReply("Done.")).rejects.toThrow("recorded amount");
    for (const reply of [
      "I recorded the decision to fund Lanterns with €24,502.50.",
      "I recorded the decision to fund Lanterns with €-2,450.25.",
      "I recorded the decision to fund Lanterns with −2,450.25 EUR.",
    ]) {
      await expect(async () => verifyReply(reply)).rejects.toThrow("recorded amount");
    }
    for (const reply of [
      "I saved your recommendation of €2,450.25 for Lanterns.",
      "I saved your recommendation of €2,450.25. This is not a decision.",
    ]) {
      await expect(async () => verifyReply(reply)).rejects.toThrow("decision");
    }
    expect((await grade(control)).effects).toEqual([]);
  },
);
