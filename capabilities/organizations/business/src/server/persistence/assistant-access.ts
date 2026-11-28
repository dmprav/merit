import type { Transaction } from "@merit/db";

import { authorizedWorkspaces } from "./scope";

export type AssistantOwner = { userId: string; slug: string };

export class AssistantStoreError extends Error {
  readonly code: "forbidden" | "consent_required";
  constructor(code: AssistantStoreError["code"]) {
    super(code);
    this.code = code;
  }
}

export const readAssistantOwner = async (tx: Transaction, { userId, slug }: AssistantOwner) => {
  const workspaces = authorizedWorkspaces(tx, userId, "read_workspace", slug);
  const [member] = await tx
    .select({ organizationId: workspaces.id, membershipId: workspaces.membershipId })
    .from(workspaces);
  return member;
};

export { readAssistantConsent as hasAssistantConsent } from "./scope";
