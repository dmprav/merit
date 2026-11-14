import { describe, expect, it } from "vite-plus/test";

import { workspaceActivityInput } from "./activity";

const workspaceSlug = "alder";

describe("workspace activity requests", () => {
  it("defaults to a page of 50 entries", () => {
    expect(workspaceActivityInput.parse({ workspaceSlug }).limit).toBe(50);
  });

  it("accepts a round, a person, and a URL-safe cursor", () => {
    expect(
      workspaceActivityInput.safeParse({
        workspaceSlug,
        roundId: "k7m2p9x4n6rt",
        personId: "dana",
        after: "MjAyNy0wMS0yMHw-_",
        limit: 1,
      }).success,
    ).toBe(true);
  });

  it.each([
    { reason: "an empty page", request: { limit: 0 } },
    { reason: "more than 50 entries", request: { limit: 51 } },
    { reason: "a fractional page size", request: { limit: 1.5 } },
    { reason: "a cursor with characters outside URL-safe base64", request: { after: "***" } },
    { reason: "a cursor over 200 characters", request: { after: "a".repeat(201) } },
    { reason: "a round that is not a public ID", request: { roundId: "round-1" } },
    { reason: "an empty person", request: { personId: "" } },
    { reason: "fields the request does not define", request: { userId: "dana" } },
  ])("rejects $reason", ({ request }) => {
    expect(workspaceActivityInput.safeParse({ workspaceSlug, ...request }).success).toBe(false);
  });
});
