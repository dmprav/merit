import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import type { Actor } from "@merit/auth";
import { publicIdSchema } from "@merit/db/identifiers";
import {
  contactApplicationListInput,
  contactApplicationSummarySchema,
  reviewListInput,
  reviewSummarySchema,
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
  activityEntrySchema,
  workspaceActivityInput,
  workspaceActivitySchema,
  workspaceSearchInput,
  workspaceSearchSchema,
} from "@merit/grantmaking/api";

import type { GrantmakingOperations } from "./operations";

const historyResult = z.object({
  status: z.literal("ok"),
  entries: z.array(historySummarySchema),
  nextRevision: z.number().int().nonnegative().nullable(),
});
const contentDescription =
  "Return a bounded JSON text fragment of the selected source. Follow nextOffset with the same fingerprint; concatenate fragments before parsing JSON. Offsets count Unicode characters. A conflict means the source changed: restart at offset 0. History sources require a revision from the history listing. No source content is silently omitted.";

const grantRecordUrl = (
  origin: string,
  workspaceSlug: string,
  kind: "application" | "round",
  id: string,
) =>
  new URL(
    `/app/${encodeURIComponent(workspaceSlug)}/${kind === "round" ? "rounds" : "applications"}/${encodeURIComponent(id)}`,
    origin,
  ).href;

const createApplicationReadingTools = (
  actor: Actor,
  grantmaking: GrantmakingOperations,
  origin: string,
) => [
  defineActorTool(
    actor,
    "list_applications",
    {
      errorSchema: readingErrorSchema,
      description:
        "List application summaries, public applicationIds and revision preconditions in stable applicationId order. Follow nextCursor; this is a live listing. Full evidence and histories are fetched separately.",
      inputSchema: applicationListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        applications: z.array(applicationSummarySchema),
        nextCursor: publicIdSchema.nullable(),
      }),
    },
    (input) => grantmaking.listApplications(actor, input),
  ),
  defineActorTool(
    actor,
    "get_application",
    {
      errorSchema: readingErrorSchema,
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
      const result = await grantmaking.readApplication(actor, input);
      return result.status === "ok"
        ? {
            ...result,
            url: grantRecordUrl(origin, input.workspaceSlug, "application", input.applicationId),
          }
        : result;
    },
  ),
  defineActorTool(
    actor,
    "list_contact_applications",
    {
      errorSchema: z.object({ status: z.literal("not_found") }),
      description:
        "List related applications in stable applicationId order, with funding round titles and applicant-contact, review-request, and recorded-assessment relationships. Includes historical review associations. Follow nextCursor. The application contactId identifies its current applicant contact.",
      inputSchema: contactApplicationListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        applications: z.array(contactApplicationSummarySchema),
        nextCursor: publicIdSchema.nullable(),
      }),
    },
    (input) => grantmaking.listContactApplications(actor, input),
  ),
  defineActorTool(
    actor,
    "list_application_reviews",
    {
      errorSchema: readingErrorSchema,
      description:
        "List current assessments and outstanding review requests in kind and UUID order with server-derived freshness and basisComparison. Comparisons distinguish application version, criteria version, and criteria content as same, different, or unknown. Freshness uses application version and criteria content; an intervening criteria revision alone does not make an assessment outdated. Follow nextCursor. Read a selected assessment or review_request through get_application_content using entryId; its history and provenance remain accessible. Use list_application_reviewers for assignment revisions and email delivery status.",
      inputSchema: reviewListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        reviews: z.array(reviewSummarySchema),
        nextCursor: reviewListInput.shape.after.unwrap().nullable(),
      }),
    },
    (input) => grantmaking.listReviews(actor, input),
  ),
];

const createContentTools = (actor: Actor, grantmaking: GrantmakingOperations) => [
  defineActorTool(
    actor,
    "get_funding_round_content",
    {
      errorSchema: readingErrorSchema,
      description:
        contentDescription +
        " For the criteria section, supply criteriaVersion to read one historical version.",
      inputSchema: roundContentInput,
      outputSchema: contentChunkSchema,
    },
    (input) => grantmaking.roundContent(actor, input),
  ),
  defineActorTool(
    actor,
    "get_application_content",
    {
      errorSchema: readingErrorSchema,
      description:
        contentDescription +
        " Use section material with materialVersion to read preserved evidence and its source directly. Reviews retain requests, all assessment versions, their evidence bases and attribution. Null means that optional source is absent.",
      inputSchema: applicationContentInput,
      outputSchema: contentChunkSchema,
    },
    (input) => grantmaking.applicationContent(actor, input),
  ),
  defineActorTool(
    actor,
    "list_funding_round_history",
    {
      errorSchema: readingErrorSchema,
      description:
        "List preparation history in ascending revision order. Pass nextRevision as afterRevision. Fetch a selected change through get_funding_round_content.",
      inputSchema: roundHistoryInput,
      outputSchema: historyResult,
    },
    (input) => grantmaking.roundHistory(actor, input),
  ),
  defineActorTool(
    actor,
    "list_application_history",
    {
      errorSchema: readingErrorSchema,
      description:
        "List intake or recommendation changes in ascending revision order. Pass nextRevision as afterRevision; fetch selected change content separately.",
      inputSchema: applicationHistoryInput,
      outputSchema: historyResult,
    },
    (input) => grantmaking.applicationHistory(actor, input),
  ),
];

const createRoundReadingTools = (
  actor: Actor,
  grantmaking: GrantmakingOperations,
  origin: string,
) => [
  defineActorTool(
    actor,
    "list_funding_rounds",
    {
      errorSchema: readingErrorSchema,
      description:
        "List compact round summaries in stable roundId order. Pass nextCursor as after until null. This is a live listing; restart to see records inserted before the cursor.",
      inputSchema: roundListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        rounds: z.array(roundSummarySchema),
        nextCursor: publicIdSchema.nullable(),
      }),
    },
    (input) => grantmaking.listRoundSummaries(actor, input),
  ),
  defineActorTool(
    actor,
    "get_funding_round",
    {
      errorSchema: readingErrorSchema,
      description:
        "Read round identity, preparation revision, manager and exact whole-round financial totals. Totals include every application independently of list pagination. Use list_applications for records and get_funding_round_content for criteria and details.",
      inputSchema: roundReadInput,
      outputSchema: z.object({ status: z.literal("ok"), round: roundOverviewSchema, url: z.url() }),
    },
    async (input) => {
      const result = await grantmaking.readRound(actor, input);
      return result.status === "ok"
        ? {
            ...result,
            url: grantRecordUrl(origin, input.workspaceSlug, "round", input.roundId),
          }
        : result;
    },
  ),
];

const createActivityTool = (actor: Actor, grantmaking: GrantmakingOperations, origin: string) =>
  defineActorTool(
    actor,
    "list_workspace_activity",
    {
      errorSchema: readingErrorSchema,
      description:
        "List who changed shared grant work in a workspace, newest first. Covers round changes (creation, details, budget, criteria, manager, deletion), application changes (creation, content, summary, contact, readiness, revisions, corrections, deletion, shared working revisions), review requests and reviewer responses, assessments (recorded, corrected, submitted, amended), and saved recommendations. Contact profiles, private reviewer drafts, and email delivery are outside this feed. Each entry gives the recorded person's name (null when none was recorded), the web or MCP-client provenance, the stored action name, and the record's current title and url, or a null record when it no longer exists. Optional roundId (the round and its applications, including their review requests, reviewer responses, assessments, and recommendations) and personId (a person from `people`) filters narrow the list; `people` lists everyone with recorded activity and is returned with the first page only (empty when `after` is given). Follow nextCursor as after until null with the same filters; the cursor applies to the filtered list. Current program managers only.",
      inputSchema: workspaceActivityInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        entries: z.array(
          activityEntrySchema.extend({
            record: activityEntrySchema.shape.record.unwrap().extend({ url: z.url() }).nullable(),
          }),
        ),
        people: workspaceActivitySchema.shape.people,
        nextCursor: z.string().nullable(),
      }),
    },
    async (input) => {
      const result = await grantmaking.listWorkspaceActivity(actor, input);
      return result.status === "ok"
        ? {
            status: result.status,
            nextCursor: result.nextCursor,
            people: result.people,
            entries: result.entries.map((entry) => ({
              ...entry,
              record: entry.record && {
                ...entry.record,
                url: grantRecordUrl(
                  origin,
                  input.workspaceSlug,
                  entry.record.kind,
                  entry.record.id,
                ),
              },
            })),
          }
        : result;
    },
  );

const createSearchTool = (actor: Actor, grantmaking: GrantmakingOperations) =>
  defineActorTool(
    actor,
    "search_workspace",
    {
      errorSchema: readingErrorSchema,
      description:
        "Find funding rounds and applications in a workspace by name or applicant, to locate a known record without listing and paging. Words in the query may appear in any order, in a round's title or in an application's title and applicant together; case and accents are ignored and typos are not corrected. Queries are limited to 200 characters. Returns at most 5 rounds and 10 applications, each group with its total number of matches, best match first (exact, then prefix, then contains; active applications before withdrawn ones). Only the current recorded application version is searched; unrecorded working revisions never match. Each result gives its public id and the fields shown in the web search; call get_application or the funding round tools with that id for details. Current program managers only.",
      inputSchema: workspaceSearchInput,
      outputSchema: workspaceSearchSchema,
    },
    (input) => grantmaking.searchWorkspace(actor, input),
  );

export const createGrantmakingTools = (
  actor: Actor,
  grantmaking: GrantmakingOperations,
  origin: string,
) => [
  ...createRoundReadingTools(actor, grantmaking, origin),
  ...createApplicationReadingTools(actor, grantmaking, origin),
  createActivityTool(actor, grantmaking, origin),
  createSearchTool(actor, grantmaking),
  ...createContentTools(actor, grantmaking),
];

export type { GrantmakingOperations } from "./operations";
