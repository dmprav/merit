import { fn } from "storybook/test";

import type * as actual from "../organizations.functions";

// Fail closed: each story supplies its own read and mutation outcomes.
export const listOrganizations = fn<
  (
    ...args: Parameters<typeof actual.listOrganizations>
  ) => ReturnType<typeof actual.listOrganizations>
>(async () => {
  throw new Error("Configure listOrganizations in the story");
});
export const readOrganization = fn<
  (
    ...args: Parameters<typeof actual.readOrganization>
  ) => ReturnType<typeof actual.readOrganization>
>(async () => {
  throw new Error("Configure readOrganization in the story");
});
export const createOrganization = fn<
  (
    ...args: Parameters<typeof actual.createOrganization>
  ) => ReturnType<typeof actual.createOrganization>
>(async () => {
  throw new Error("Configure createOrganization in the story");
});
export const renameOrganization = fn<
  (
    ...args: Parameters<typeof actual.renameOrganization>
  ) => ReturnType<typeof actual.renameOrganization>
>(async () => {
  throw new Error("Configure renameOrganization in the story");
});
export const inviteAdministrator = fn<
  (
    ...args: Parameters<typeof actual.inviteAdministrator>
  ) => ReturnType<typeof actual.inviteAdministrator>
>(async () => {
  throw new Error("Configure inviteAdministrator in the story");
});
export const revokeInvitation = fn<
  (
    ...args: Parameters<typeof actual.revokeInvitation>
  ) => ReturnType<typeof actual.revokeInvitation>
>(async () => {
  throw new Error("Configure revokeInvitation in the story");
});
