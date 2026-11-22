import { assert, expect } from "vite-plus/test";

import { endpoint } from "../../../fixtures/transport-test";
import { catalogTest } from "../catalog-trial";
import { gradeSelection } from "../tool-selection";

catalogTest(
  "grades links to the existing demo returned by either lookup",
  async ({ catalog, database }) => {
    const { item, scenario, scripted, server, grade } = await catalog("resume-demo");
    const reply = await scripted();
    const calls = server.trace.map((call) => call.name);
    expect(calls).toEqual(["list_workspaces"]);
    expect(gradeSelection(item, scenario, server.trace)).toEqual([]);

    const {
      rows: [demo],
    } = await database.client.query<{ slug: string; id: string }>(
      "SELECT o.slug, r.id FROM organizations o JOIN funding_rounds r ON r.organization_id=o.id WHERE o.kind='demo'",
    );
    assert(demo);
    const home = new URL("/app/" + demo.slug + "/rounds", endpoint);

    const verify = async (text: string) => (await grade(text)).reply.status;

    expect(await verify(reply)).toBe("passed");
    expect(await verify("Open " + new URL(home.pathname + "/" + demo.id, server.url).href)).toBe(
      "passed",
    );
    expect(await verify("Open " + home.pathname + "/" + demo.id + ".")).toBe("passed");
    for (const wrong of [
      "Your demo is ready.",
      "[Open the demo](/app/alder/rounds)",
      home.href + "/other-round",
      "[" + home.href + "](https://example.test" + home.pathname + ")",
      "https://example.test/?next=" + home.href,
    ]) {
      expect(await verify(wrong)).toBe("failed");
    }
  },
);

catalogTest(
  "grades the existing demo round with or without an explicit resume",
  async ({ catalog }) => {
    const { item, scenario, scripted, server, grade } = await catalog("demo-to-round");
    const reply = await scripted();
    const direct = server.trace;
    const calls = direct.map((call) => call.name);
    expect(calls).not.toContain("start_demo");
    expect(gradeSelection(item, scenario, server.trace)).toEqual([]);
    expect((await grade(reply, direct)).reply.status).toBe("passed");
    expect((await grade("€18,000 left.", direct)).reply.status).toBe("failed");
    expect((await grade("€8,000.50 left.", direct)).reply.status).toBe("failed");
    expect((await grade(reply, [])).selection.length).toBeGreaterThan(0);
  },
);
