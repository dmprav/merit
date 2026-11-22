import { assert, expect } from "vite-plus/test";

import { catalogTest } from "../catalog-trial";
import { gradeSelection } from "../tool-selection";

catalogTest(
  "grades the sent invitation with or without a status lookup",
  async ({ catalog, database }) => {
    const { item, scenario, scripted, server, grade } = await catalog("arrange-review");
    const reply = await scripted();
    const calls = server.trace.map(({ name }) => name);
    expect(calls.filter((name) => name === "request_review" || name === "invite_reviewer")).toEqual(
      ["request_review", "invite_reviewer"],
    );
    expect(calls).not.toContain("list_application_reviewers");
    expect(gradeSelection(item, scenario, server.trace)).toEqual([]);
    expect((await grade(reply)).effects).toEqual([]);

    const updated = await database.client.query(
      "update reviewer_messages set status = 'failed' where kind = 'invitation' and recipient = $1",
      ["priya@example.test"],
    );
    expect(updated.rowCount).toBe(1);
    expect((await grade(reply)).effects).toEqual([expect.stringContaining("sent")]);
  },
);

catalogTest("flags an invented send in otherwise usable invitation copy", async ({ catalog }) => {
  const { scenario, scripted } = await catalog("reserve-write-invite");
  const grade = scenario.verifyReply;
  assert(grade);
  await grade(await scripted());
  await grade("Could you review River Gardens? I’ll send you the invitation if you’re available.");
  await grade("Could you review River Gardens? I haven’t sent you a formal invitation yet.");
  // Captured Haiku reply. No invitation was sent during this trial.
  const invented =
    "Hi Priya, I'd like you to assess the River Gardens application for our current funding round, and I've sent you an invitation with the details. Please let me know if you're able to take it on, or if there's a conflict I should know about.";
  await expect(async () => grade(invented)).rejects.toThrow("already sent");
  await expect(async () =>
    grade("Could you review River Gardens? A review invitation has already been emailed to you."),
  ).rejects.toThrow("already sent");
});
