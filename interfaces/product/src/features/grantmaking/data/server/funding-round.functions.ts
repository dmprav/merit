import { createServerFn } from "@tanstack/react-start";

import {
  applicationRequestSchema,
  workspaceApplicationsInput,
  encodeApplicationDetail,
  publicRoundRequestSchema,
  encodeRoundPage,
  encodeRoundSummary,
} from "@merit/grantmaking/api";
import { workspaceSlugSchema } from "@merit/organizations/api";

import {
  loadWorkspaceApplications,
  loadFundingRoundPage,
  loadFundingRounds,
  loadFundingApplicationPage,
} from "./funding-round.server";

export const readFundingRounds = createServerFn({ method: "GET" })
  .validator(workspaceSlugSchema)
  .handler(async ({ data, context }) => {
    const result = await loadFundingRounds(data, {
      listRounds: context.grantmaking.listRounds,
      currentIdentity: context.currentIdentity,
    });
    return result.status === "ok"
      ? { ...result, rounds: result.rounds.map(encodeRoundSummary) }
      : result;
  });

export const readFundingRoundPage = createServerFn({ method: "GET" })
  .validator(publicRoundRequestSchema)
  .handler(async ({ data, context }) => {
    const result = await loadFundingRoundPage(data, {
      readRoundPage: context.grantmaking.readRoundPage,
      currentIdentity: context.currentIdentity,
    });
    return result.status === "ok" ? { ...result, round: encodeRoundPage(result.round) } : result;
  });

export const readFundingApplicationPage = createServerFn({ method: "GET" })
  .validator(applicationRequestSchema)
  .handler(async ({ data, context }) => {
    const result = await loadFundingApplicationPage(data, {
      readApplicationPage: context.grantmaking.readApplicationPage,
      currentIdentity: context.currentIdentity,
    });
    return result.status === "ok" ? { ...result, ...encodeApplicationDetail(result) } : result;
  });

export const readWorkspaceApplications = createServerFn({ method: "POST" })
  .validator(workspaceApplicationsInput)
  .handler(async ({ data, context }) => {
    return loadWorkspaceApplications(data, {
      listWorkspaceApplications: context.grantmaking.listWorkspaceApplications,
      currentIdentity: context.currentIdentity,
    });
  });
