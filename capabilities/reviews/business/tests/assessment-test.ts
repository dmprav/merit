import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { materialVersionSchema } from "@merit/applications/domain";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { noContactGrantWork } from "@merit/contacts/testing";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import { criteriaVersionSchema } from "@merit/rounds/domain";

export const contact = async (db: NodePgDatabase, name = "Sam") => {
  const input = {
    workspaceSlug,
    contactId: randomUUID(),
    action: "create" as const,
    details: { name, email: "", affiliation: "" },
  };
  const result = await changeWorkspaceContact(db, actor, input, noContactGrantWork);

  if (result.status !== "ok") {
    throw new Error("Contact creation failed");
  }
  return result.contact;
};

export const content = {
  applicationVersion: materialVersionSchema.parse(1),
  criteriaVersion: criteriaVersionSchema.parse(1),
  date: null,
  position: "Fund" as const,
  amount: encodeMoney(fromMinorUnits(1800000n)),
  reasoning: "Practical plan with a confirmed free venue.",
  observations: [],
};

export const unknownBasisRecord = (contactId: string) => ({
  action: "record" as const,
  id: randomUUID(),
  contactId,
  requestId: null,
  previousId: null,
  content: {
    ...content,
    applicationVersion: null,
    criteriaVersion: null,
    position: null,
    amount: null,
  },
});
