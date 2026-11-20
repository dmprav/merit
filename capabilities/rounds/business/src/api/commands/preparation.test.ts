import { describe, expect, it } from "vite-plus/test";

import { createRoundRequestSchema, editRoundRequestSchema } from "./preparation";

const workspaceSlug = "alder";
const requestId = "01a1bf9d-aa6f-7b30-9015-bcabb7406cbc";
const publicId = "b8q3w5j7c2df";
describe("round creation inputs", () => {
  it.each([undefined, "", "0", "12.34"])("accepts an optional nonnegative budget: %j", (budget) => {
    expect(
      createRoundRequestSchema.parse({ workspaceSlug, requestId, title: "Round", budget }).budget,
    ).toBe(budget);
  });

  it.each(["-1", "1.001", "1e3", "9".repeat(33)])("rejects an invalid budget: %s", (budget) => {
    expect(
      createRoundRequestSchema.safeParse({ workspaceSlug, requestId, title: "Round", budget })
        .success,
    ).toBe(false);
  });
});

describe("round edit revision preconditions", () => {
  it.each([
    { section: "details" as const, title: "Updated title" },
    { section: "details" as const, meetingDate: "2027-04-01" },
    { section: "manager" as const, userId: "dana" },
  ])("allows omitting expectedRevision for Tier 1 section %j", (change) => {
    expect(editRoundRequestSchema.safeParse({ workspaceSlug, publicId, change }).success).toBe(
      true,
    );
  });

  it.each([
    { section: "details" as const, purpose: "Updated purpose" },
    { section: "criteria" as const, criteria: [] },
    { section: "budget" as const, amount: "100.00", reason: "" },
  ])("requires expectedRevision for Tier 2 section %j", (change) => {
    expect(editRoundRequestSchema.safeParse({ workspaceSlug, publicId, change }).success).toBe(
      false,
    );
    expect(
      editRoundRequestSchema.safeParse({ workspaceSlug, publicId, expectedRevision: 0, change })
        .success,
    ).toBe(true);
  });

  it.each([
    { section: "details" as const, title: "Undo title" },
    { section: "details" as const, meetingDate: null },
    { section: "manager" as const, userId: "dana" },
  ])("requires expectedRevision for %j when requireCurrentRevision is set", (change) => {
    expect(
      editRoundRequestSchema.safeParse({
        workspaceSlug,
        publicId,
        change,
        requireCurrentRevision: true,
      }).success,
    ).toBe(false);
    expect(
      editRoundRequestSchema.safeParse({
        workspaceSlug,
        publicId,
        expectedRevision: 1,
        change,
        requireCurrentRevision: true,
      }).success,
    ).toBe(true);
  });
});
