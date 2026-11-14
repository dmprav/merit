import { describe, expect, it } from "vite-plus/test";

import { auditRecordSchema } from "./event";

const record = {
  organizationId: "alder",
  actor: { userId: "dana", name: "Dana Reed", provenance: { interface: "web" } },
  action: "recommendation.recorded",
  target: { type: "recommendation", id: "k7m2p9x4n6rt", revision: 2 },
};

describe("audit records", () => {
  it.each([
    { reason: "explicit attribution and a compact target", input: record },
    {
      reason: "an actor without a recorded name",
      input: { ...record, actor: { ...record.actor, name: null } },
    },
    {
      reason: "unknown provenance",
      input: { ...record, actor: { ...record.actor, provenance: null } },
    },
    {
      reason: "a target without a revision",
      input: { ...record, target: { ...record.target, revision: null } },
    },
    {
      reason: "creation as revision zero",
      input: { ...record, target: { ...record.target, revision: 0 } },
    },
    {
      reason: "round and application context",
      input: { ...record, context: { roundId: "r1", applicationId: "a1" } },
    },
  ])("accepts $reason", ({ input }) => {
    expect(auditRecordSchema.parse(input)).toEqual(input);
  });

  it.each([
    { reason: "an empty workspace", input: { ...record, organizationId: "" } },
    { reason: "an empty actor", input: { ...record, actor: { ...record.actor, userId: "" } } },
    {
      reason: "MCP provenance without a client",
      input: {
        ...record,
        actor: { ...record.actor, provenance: { interface: "mcp", clientId: "" } },
      },
    },
    { reason: "an empty action", input: { ...record, action: "" } },
    {
      reason: "a display label as the action",
      input: { ...record, action: "Recommendation saved" },
    },
    {
      reason: "an action over 128 characters",
      input: { ...record, action: `a.${"b".repeat(127)}` },
    },
    { reason: "an empty target ID", input: { ...record, target: { ...record.target, id: "" } } },
    {
      reason: "an empty target type",
      input: { ...record, target: { ...record.target, type: "" } },
    },
    {
      reason: "a negative revision",
      input: { ...record, target: { ...record.target, revision: -1 } },
    },
    {
      reason: "a fractional revision",
      input: { ...record, target: { ...record.target, revision: 1.5 } },
    },
    {
      reason: "context the record does not define",
      input: { ...record, context: { reviewerId: "x" } },
    },
    { reason: "format version zero", input: { ...record, formatVersion: 0 } },
    { reason: "application material", input: { ...record, content: "Full application material" } },
  ])("rejects $reason", ({ input }) => {
    expect(auditRecordSchema.safeParse(input).success).toBe(false);
  });
});
