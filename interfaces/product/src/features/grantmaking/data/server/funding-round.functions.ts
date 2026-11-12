import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import {
  applicationRequestSchema,
  encodeApplicationDetail,
  publicRoundRequestSchema,
  encodeRoundOverview,
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
    setResponseHeader("Cache-Control", "private, no-store");
    const result = await loadFundingRounds(data, context.workspace);
    return result.status === "ok"
      ? { ...result, rounds: result.rounds.map(encodeRoundSummary) }
      : result;
  });

export const readFundingRoundPage = createServerFn({ method: "GET" })
  .validator(publicRoundRequestSchema)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const result = await loadFundingRoundPage(data, context.workspace);
    return result.status === "ok"
      ? { ...result, round: encodeRoundOverview(result.round) }
      : result;
  });

export const readFundingApplicationPage = createServerFn({ method: "GET" })
  .validator(applicationRequestSchema)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const result = await loadFundingApplicationPage(data, context.workspace);
    return result.status === "ok" ? { ...result, ...encodeApplicationDetail(result) } : result;
  });

export const readWorkspaceApplications = createServerFn({ method: "GET" })
  .validator(workspaceSlugSchema)
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return loadWorkspaceApplications(data, context.workspace);
  });
