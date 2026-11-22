import { createHash } from "node:crypto";

import { afterEach, assert, expect, it, vi } from "vite-plus/test";

import { createServerAnalytics, type GrantOutcome } from "./server";

const outcome: GrantOutcome = {
  event: "round_created",
  workspaceKind: "standard",
  workspaceId: "internal-workspace-id",
  surface: "web",
};

const observeRequests = () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response());
  vi.stubGlobal("fetch", send);
  return send;
};

afterEach(() => vi.unstubAllGlobals());

it("disables server analytics with a blank token", () => {
  const send = observeRequests();
  expect(createServerAnalytics({ apiKey: "  " })).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});

it("links invited grant work across surfaces and leaves demo and MCP calls unlinked", () => {
  const send = observeRequests();
  const analytics = createServerAnalytics({ apiKey: " phc_test " });
  analytics?.captureGrantOutcome(outcome);
  analytics?.captureGrantOutcome({ ...outcome, surface: "mcp" });
  analytics?.captureGrantOutcome({ ...outcome, workspaceId: "another-workspace" });
  analytics?.captureGrantOutcome({ ...outcome, workspaceKind: "demo" });
  analytics?.captureMcpToolFinished("create_funding_round", "invalid_input");

  const events = send.mock.calls.map(([url, init]) => {
    expect(url).toEqual(new URL("https://eu.i.posthog.com/i/v0/e/"));
    expect(init?.method).toBe("POST");
    assert(typeof init?.body === "string");
    expect(init.body).not.toContain(outcome.workspaceId);
    const payload: unknown = JSON.parse(init.body);
    return payload;
  });
  const workspaceKey = createHash("sha256")
    .update("merit.workspace:internal-workspace-id")
    .digest("hex");
  const privacy = { $process_person_profile: false, $geoip_disable: true };
  const distinctId: unknown = expect.any(String);
  const otherWorkspaceKey: unknown = expect.not.stringMatching(workspaceKey);
  const grantEvent = {
    api_key: "phc_test",
    event: "round_created",
    distinct_id: distinctId,
  };
  const standard = { ...privacy, workspace_kind: "standard", workspace_key: workspaceKey };
  expect(events).toEqual([
    { ...grantEvent, properties: { ...standard, surface: "web" } },
    { ...grantEvent, properties: { ...standard, surface: "mcp" } },
    {
      ...grantEvent,
      properties: {
        ...standard,
        surface: "web",
        workspace_key: otherWorkspaceKey,
      },
    },
    { ...grantEvent, properties: { ...privacy, workspace_kind: "demo", surface: "web" } },
    {
      ...grantEvent,
      event: "mcp_tool_finished",
      properties: { ...privacy, tool_name: "create_funding_round", outcome: "invalid_input" },
    },
  ]);
  const ids = events.map((event) => {
    assert(event && typeof event === "object" && "distinct_id" in event);
    return event.distinct_id;
  });
  expect(new Set(ids).size).toBe(5);
});

it("bounds concurrent deliveries and continues capturing after ingestion failures", async () => {
  let rejectDelivery: (error: Error) => void = () => {};

  const pending = new Promise<Response>((_, reject) => {
    rejectDelivery = reject;
  });
  const send = vi.fn<typeof fetch>().mockReturnValue(pending);
  vi.stubGlobal("fetch", send);
  const analytics = createServerAnalytics({
    apiKey: "test",
    host: "https://staging.example/ingest",
  });
  for (let index = 0; index < 51; index++) {
    analytics?.captureMcpToolFinished("list_funding_rounds", "ok");
  }
  expect(send).toHaveBeenCalledTimes(50);
  expect(send.mock.calls[0]?.[0]).toEqual(new URL("https://staging.example/ingest/i/v0/e/"));
  rejectDelivery(new Error("unreachable"));
  await Promise.resolve();
  analytics?.captureGrantOutcome(outcome);
  expect(send).toHaveBeenCalledTimes(51);
});
