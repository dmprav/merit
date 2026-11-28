import { eq } from "drizzle-orm";

import type { Transaction } from "@merit/db";

import { assistantConsents } from "./assistant-schema";
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

export const hasAssistantConsent = async (tx: Transaction, organizationId: string) => {
  const [consent] = await tx
    .select()
    .from(assistantConsents)
    .where(eq(assistantConsents.organizationId, organizationId));
  return !!consent;
};
