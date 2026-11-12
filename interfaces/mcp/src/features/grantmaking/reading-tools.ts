import { z } from "zod";

import {
  reviewListInput,
  reviewSummarySchema,
  publicIdSchema,
  roundReadInput,
  applicationReadInput,
  roundListInput,
  applicationListInput,
  roundContentInput,
  applicationContentInput,
  roundHistoryInput,
  applicationHistoryInput,
  roundSummarySchema,
  applicationSummarySchema,
  roundOverviewSchema,
  applicationContextSchema,
  contentChunkSchema,
  historySummarySchema,
  readingErrorSchema,
} from "@merit/grantmaking/api";

import type { RegisterTool } from "../../components/register-tool";
import type { McpActor } from "../../contracts";
import type { FundingRoundOperations } from "./operations";

const read = {
  scope: "workspace:read" as const,
  errorSchema: readingErrorSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
const historyResult = z.object({
  status: z.literal("ok"),
  entries: z.array(historySummarySchema),
  nextRevision: z.number().int().nonnegative().nullable(),
});
const contentDescription =
  "Return a bounded JSON text fragment of the selected source. Follow nextOffset with the same fingerprint; concatenate fragments before parsing JSON. Offsets count Unicode characters. A conflict means the source changed: restart at offset 0. History sources require a revision from the history listing. No source content is silently omitted.";

type ReadingOperations = Pick<
  FundingRoundOperations,
  | "listRounds"
  | "readRound"
  | "listApplications"
  | "readApplication"
  | "listReviews"
  | "roundContent"
  | "applicationContent"
  | "roundHistory"
  | "applicationHistory"
>;

const registerApplicationReadingTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: ReadingOperations,
  origin: string,
) => {
  register(
    "list_applications",
    {
      ...read,
      description:
        "List application summaries, public applicationIds and revision preconditions in stable applicationId order. Follow nextCursor; this is a live listing. Full evidence and histories are fetched separately.",
      inputSchema: applicationListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        applications: z.array(applicationSummarySchema),
        nextCursor: publicIdSchema.nullable(),
      }),
    },
    (input) => workspace.listApplications(actor, input),
  );
  register(
    "get_application",
    {
      ...read,
      description:
        "Read current application context and distinct intake, review, recommendation, application and criteria versions. Use the appropriate revision for each command. Read content separately; reread after conflicts without overwriting newer work.",
      inputSchema: applicationReadInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        application: applicationContextSchema,
        url: z.url(),
      }),
    },
    async (input) => {
      const result = await workspace.readApplication(actor, input);
      return result.status === "ok"
        ? {
            ...result,
            url: new URL(`/app/${input.workspaceSlug}/applications/${input.applicationId}`, origin)
              .href,
          }
        : result;
    },
  );
  register(
    "list_application_reviews",
    {
      ...read,
      description:
        "List current assessments and outstanding review requests in stable ID order with server-derived freshness and basisComparison. Comparisons distinguish application version, criteria version, and criteria content as same, different, or unknown. Freshness uses application version and criteria content; an intervening criteria revision alone does not make an assessment outdated. Follow nextCursor. Read a selected assessment or review_request through get_application_content using entryId; its history and provenance remain accessible.",
      inputSchema: reviewListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        reviews: z.array(reviewSummarySchema),
        nextCursor: z.string().nullable(),
      }),
    },
    (input) => workspace.listReviews(actor, input),
  );
};

const registerContentTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: ReadingOperations,
) => {
  register(
    "get_funding_round_content",
    {
      ...read,
      description: contentDescription,
      inputSchema: roundContentInput,
      outputSchema: contentChunkSchema,
    },
    (input) => workspace.roundContent(actor, input),
  );
  register(
    "get_application_content",
    {
      ...read,
      description:
        contentDescription +
        " Use section material with materialVersion to read preserved evidence and its source directly. Reviews retain requests, all assessment versions, their evidence bases and attribution. Null means that optional source is absent.",
      inputSchema: applicationContentInput,
      outputSchema: contentChunkSchema,
    },
    (input) => workspace.applicationContent(actor, input),
  );
  register(
    "list_funding_round_history",
    {
      ...read,
      description:
        "List preparation history in ascending revision order. Pass nextRevision as afterRevision. Fetch a selected change through get_funding_round_content.",
      inputSchema: roundHistoryInput,
      outputSchema: historyResult,
    },
    (input) => workspace.roundHistory(actor, input),
  );
  register(
    "list_application_history",
    {
      ...read,
      description:
        "List intake or recommendation changes in ascending revision order. Pass nextRevision as afterRevision; fetch selected change content separately.",
      inputSchema: applicationHistoryInput,
      outputSchema: historyResult,
    },
    (input) => workspace.applicationHistory(actor, input),
  );
};

const registerRoundReadingTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: ReadingOperations,
  origin: string,
) => {
  register(
    "list_funding_rounds",
    {
      ...read,
      description:
        "List compact round summaries in stable roundId order. Pass nextCursor as after until null. This is a live listing; restart to see records inserted before the cursor.",
      inputSchema: roundListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        rounds: z.array(roundSummarySchema),
        nextCursor: publicIdSchema.nullable(),
      }),
    },
    (input) => workspace.listRounds(actor, input),
  );
  register(
    "get_funding_round",
    {
      ...read,
      description:
        "Read round identity, preparation revision, manager and exact whole-round financial totals. Totals include every application independently of list pagination. Use list_applications for records and get_funding_round_content for criteria and details.",
      inputSchema: roundReadInput,
      outputSchema: z.object({ status: z.literal("ok"), round: roundOverviewSchema, url: z.url() }),
    },
    async (input) => {
      const result = await workspace.readRound(actor, input);
      return result.status === "ok"
        ? {
            ...result,
            url: new URL(`/app/${input.workspaceSlug}/rounds/${input.roundId}`, origin).href,
          }
        : result;
    },
  );
};

export const registerFundingReadingTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: ReadingOperations,
  origin: string,
) => {
  registerRoundReadingTools(register, actor, workspace, origin);
  registerApplicationReadingTools(register, actor, workspace, origin);
  registerContentTools(register, actor, workspace);
};
