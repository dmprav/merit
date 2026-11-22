import { assert, expect } from "vite-plus/test";

import { catalogTest } from "../catalog-trial";
import { gradeSelection } from "../tool-selection";
import { createRound } from "./round-fixtures";

catalogTest("grades a prepared round with no recorded budget reason", async ({ catalog }) => {
  const { grade, scripted } = await catalog("prepare-round");
  const reply = await scripted(async (call) => {
    const roundId = await createRound(call, "Harbour Access", "12000");
    const result = await call("edit_funding_round", {
      workspaceSlug: "alder",
      roundId,
      change: { section: "manager", userId: "mina" },
    });
    expect(result.status).toBe("ok");
    return "Prepared the round.";
  });
  expect((await grade(reply)).effects).toEqual([expect.stringContaining("budget reason")]);
});

catalogTest("accepts a prepared round without an extra read", async ({ catalog }) => {
  const { item, scenario, server, scripted, grade } = await catalog("prepare-round");
  const reply = await scripted();
  expect(server.trace.some((call) => call.name === "get_funding_round")).toBe(false);
  expect(gradeSelection(item, scenario, server.trace)).toEqual([]);
  expect((await grade(reply)).effects).toEqual([]);
});

catalogTest("a rejected history request supplies no revision evidence", async ({ catalog }) => {
  const { grade, scripted, server } = await catalog("round-changes");
  const reply = await scripted();
  const first = server.trace.find((call) => call.name === "list_funding_round_history");
  assert(first);
  // Send malformed input directly on the wire, bypassing client-side schema validation.
  const response = await fetch(server.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${server.token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: first.name,
        arguments: { ...first.arguments, afterRevision: "bad", limit: 50 },
      },
    }),
  });
  await response.text();
  const rejected = server.trace.at(-1);
  assert(rejected);
  expect(rejected.outcome.kind).toBe("error");
  expect((await grade(reply, [rejected])).selection).toContainEqual(
    expect.stringContaining("Read all preparation history pages"),
  );
});

catalogTest(
  "grades round discovery, persisted effects, and the final list independently",
  async ({ catalog }) => {
    const { grade, scripted, server } = await catalog("all-rounds");
    const reply = await scripted();
    const valid = await grade(reply);
    expect(valid).toEqual({ selection: [], effects: [], reply: { status: "passed" } });

    const incompleteReply = await grade("Only one round.");
    expect(incompleteReply).toMatchObject({
      selection: [],
      effects: [],
      reply: { status: "failed" },
    });

    const pages = server.trace.filter((call) => call.name === "list_funding_rounds");
    expect(pages).toHaveLength(2);
    const incompleteRead = await grade(reply, pages.slice(0, 1));
    expect(incompleteRead.selection).toHaveLength(1);
    expect(incompleteRead.effects).toEqual([]);
    expect(incompleteRead.reply.status).toBe("passed");
  },
);
