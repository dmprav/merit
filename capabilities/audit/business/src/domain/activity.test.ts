import { describe, expect, it } from "vite-plus/test";

import {
  activityInputSchema,
  auditPageInput,
  decodeActivityCursor,
  encodeActivityCursor,
} from "./activity";

const cursor = {
  recordedAt: new Date("2027-01-20T12:00:00.123Z"),
  id: "6bca8fde-b474-4ca7-a80b-3bc8af1cc979",
};

describe("activity cursor", () => {
  it("round-trips an event position in a URL-safe, opaque form", () => {
    const encoded = encodeActivityCursor(cursor);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain(cursor.id);
    expect(decodeActivityCursor(encoded)).toEqual(cursor);
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
    { targetTypes: Array.from({ length: 21 }, () => "round") },
    { organizationId: "alder" },
    { workspaceSlug: "alder" },
  ])("rejects %j", (change) => {
    expect(activityInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
});

describe("audit page input", () => {
  it("defaults to a page of 20 events", () => {
    expect(auditPageInput.parse({})).toEqual({ limit: 20 });
  });

  it.each([1, 50])("accepts a page of %s", (limit) => {
    expect(auditPageInput.parse({ limit, after: encodeActivityCursor(cursor) })).toEqual({
      limit,
      after: encodeActivityCursor(cursor),
    });
  });

  it.each([
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { after: "not-a-cursor" },
    { subjectId: "x" },
  ])("rejects %j", (change) => {
    expect(auditPageInput.safeParse(change).success).toBe(false);
  });
});
