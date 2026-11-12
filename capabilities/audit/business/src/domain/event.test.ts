import { expect, it } from "vite-plus/test";

import { auditRecordSchema } from "./event";

const record = {
  organizationId: "alder",
  actor: { userId: "dana", name: "Dana Reed", provenance: { interface: "web" } },
  action: "recommendation.saved",
  target: { type: "recommendation", id: "k7m2p9x4n6rt", revision: 2 },
};

it("requires explicit attribution and a compact reference to the affected record", () => {
  expect(auditRecordSchema.parse(record)).toEqual(record);
  expect(
    auditRecordSchema.parse({
      ...record,
      actor: { ...record.actor, name: null },
      target: { ...record.target, revision: null },
    }),
  ).toMatchObject({ actor: { name: null }, target: { revision: null } });
  for (const input of [
    { ...record, organizationId: "" },
    { ...record, actor: { ...record.actor, userId: "" } },
    { ...record, actor: { ...record.actor, provenance: { interface: "mcp", clientId: "" } } },
    { ...record, action: "" },
    { ...record, action: "Recommendation saved" },
    { ...record, target: { ...record.target, id: "" } },
    { ...record, target: { ...record.target, type: "" } },
    { ...record, target: { ...record.target, revision: 0 } },
    { ...record, target: { ...record.target, revision: 1.5 } },
    { ...record, content: "Full application material" },
  ]) {
    expect(auditRecordSchema.safeParse(input).success).toBe(false);
  }
});
