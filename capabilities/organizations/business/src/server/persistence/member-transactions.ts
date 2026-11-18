import type { Database } from "@merit/db";

import { readScoped as readTenant, writeScoped as writeTenant, type MemberScope } from "./tenant";
import type { Transaction } from "./transaction";

export { readWorkspace, writeWorkspace } from "./tenant";

// Other capabilities can open member operations. Onboarding scopes belong to Organizations.
type MemberTransaction = <T>(
  db: Database,
  scope: MemberScope,
  operation: (tx: Transaction) => Promise<T>,
) => Promise<T>;

export const readScoped: MemberTransaction = readTenant;
export const writeScoped: MemberTransaction = writeTenant;

export const assignmentScope = (userId: string, assignmentId: string, slug?: string): MemberScope =>
  slug === undefined
    ? { kind: "assignment", userId, assignmentId }
    : { kind: "workspace", userId, slug };
