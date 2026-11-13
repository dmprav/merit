import { describe, expect, it } from "vite-plus/test";

import { activityInputSchema, decodeActivityCursor, encodeActivityCursor } from "./activity";

const cursor = { recordedAt: new Date("2027-01-20T12:00:00.123Z"), id: crypto.randomUUID() };

describe("activity cursor", () => {
  it("round-trips an event position in a URL-safe, opaque form", () => {
    const encoded = encodeActivityCursor(cursor);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain(cursor.id);
    expect(decodeActivityCursor(encoded)).toEqual(cursor);
  });

  it("encodes characters outside the base64 alphabet that a URL cannot carry", () => {
    // Millisecond digits and ids vary the base64 output; any encoding must stay URL-safe.
    for (let index = 0; index < 50; index++) {
      const value = {
        recordedAt: new Date(1_800_000_000_000 + index * 997),
        id: crypto.randomUUID(),
      };
      const encoded = encodeActivityCursor(value);

      expect(encoded).not.toMatch(/[+/=]/);
      expect(decodeActivityCursor(encoded)).toEqual(value);
    }
  });

  it.each([
    ["not base64", "***"],
    ["an empty value", ""],
    ["a missing id", btoa("2027-01-20T12:00:00.123Z")],
    ["an invalid time", btoa(`yesterday|${cursor.id}`)],
    ["an invalid id", btoa("2027-01-20T12:00:00.123Z|id")],
    ["extra parts", btoa(`2027-01-20T12:00:00.123Z|${cursor.id}|more`)],
  ])("rejects %s", (_name, value) => {
    expect(decodeActivityCursor(value)).toBeNull();
  });
});

describe("activity input", () => {
  const input = { targetTypes: ["round", "application"] };

  it("defaults to a full page of the whole workspace", () => {
    expect(activityInputSchema.parse(input)).toEqual({ ...input, limit: 50 });
  });

  it("accepts a person, historical round and continuation", () => {
    const value = {
      ...input,
      actorUserId: "dana",
      roundId: "round1",
      after: encodeActivityCursor(cursor),
      limit: 10,
    };

    expect(activityInputSchema.parse(value)).toEqual(value);
  });

  it.each([
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { actorUserId: "" },
    { after: "not-a-cursor" },
    { roundId: "" },
    { targetTypes: [] },
    { organizationId: "alder" },
    { workspaceSlug: "alder" },
  ])("rejects %j", (change) => {
    expect(activityInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
});
