import { fn } from "storybook/test";

import type * as actual from "../team.functions";

// Fail closed: each story supplies its own read and mutation outcomes.
export const readTeam = fn<
  (...args: Parameters<typeof actual.readTeam>) => ReturnType<typeof actual.readTeam>
>(async () => {
  throw new Error("Configure readTeam in the story");
});
export const inviteMember = fn<
  (...args: Parameters<typeof actual.inviteMember>) => ReturnType<typeof actual.inviteMember>
>(async () => {
  throw new Error("Configure inviteMember in the story");
});
export const resendMemberInvitation = fn<
  (
    ...args: Parameters<typeof actual.resendMemberInvitation>
  ) => ReturnType<typeof actual.resendMemberInvitation>
>(async () => {
  throw new Error("Configure resendMemberInvitation in the story");
});
export const revokeMemberInvitation = fn<
  (
    ...args: Parameters<typeof actual.revokeMemberInvitation>
  ) => ReturnType<typeof actual.revokeMemberInvitation>
>(async () => {
  throw new Error("Configure revokeMemberInvitation in the story");
});
export const changeMember = fn<
  (...args: Parameters<typeof actual.changeMember>) => ReturnType<typeof actual.changeMember>
>(async () => {
  throw new Error("Configure changeMember in the story");
});
export const removeMember = fn<
  (...args: Parameters<typeof actual.removeMember>) => ReturnType<typeof actual.removeMember>
>(async () => {
  throw new Error("Configure removeMember in the story");
});

export const readTeamHistory = fn<
  (...args: Parameters<typeof actual.readTeamHistory>) => ReturnType<typeof actual.readTeamHistory>
>(async () => {
  throw new Error("Configure readTeamHistory in the story");
});
