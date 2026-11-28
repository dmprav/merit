import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import { cursorPage, revisionPage } from "@merit/ai/contracts";
import type { Actor } from "@merit/auth";
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
  roundListPageSchema,
  roundHistoryPageSchema,
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

import { presentRoundHistoryEntry, roundHistoryToolEntrySchema } from "./history";
import type { GrantmakingOperations } from "./operations";

const historyResult = z.object({
  status: z.literal("ok"),
  entries: z.array(historySummarySchema),
  nextPage: applicationHistoryInput.required({ afterRevision: true }).nullable(),
});
const contentDescription =
  "Read a JSON source in chunks. If nextOffset is a number, repeat the same request with offset set to nextOffset and the returned fingerprint. Only a null nextOffset marks the end of the source. Read through the end before reporting that a passage is missing. Join the fragments before parsing JSON. Offsets count Unicode characters. On conflict, restart at offset 0. History sources require a revision from the history listing.";

const historicalMaterial =
  'For original wording, call get_application_content with section "material" and materialVersion: 1. Read successive material versions in order if intake began with only a title or the passage was added later. Cite the earliest available snapshot containing the passage and check its recorded source. Disclose gaps in earlier material.';

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

const createApplicationContextTool = (
  actor: Actor,
  grantmaking: GrantmakingOperations,
  origin: string,
) =>
  defineActorTool(
    actor,
    "get_application",
    {
      errorSchema: readingErrorSchema,
      description:
        "Read current application context and distinct intake, review, recommendation, decision, application and criteria versions, including the current committee decision with its revision and recorder. Use the appropriate revision for each command. Read content separately; reread after conflicts without overwriting newer work.",
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
  );

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
        "List one funding round's application summaries, public applicationIds and revision preconditions in stable applicationId order. Pass nextPage to this tool; this is a live listing. For a contact's applications across the workspace, use list_contact_applications. Full evidence and histories are fetched separately.",
      inputSchema: applicationListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        applications: z.array(applicationSummarySchema),
        nextPage: applicationListInput.required({ after: true }).nullable(),
      }),
    },
    async (input) => {
      const result = await grantmaking.listApplications(actor, input);
      return result.status === "ok" ? cursorPage(input, result) : result;
    },
  ),
  createApplicationContextTool(actor, grantmaking, origin),
  defineActorTool(
    actor,
    "list_contact_applications",
    {
      errorSchema: z.object({ status: z.literal("not_found") }),
      description:
        "List a contact's linked applications across all rounds in the workspace using their contactId. Results include round titles and applicant-contact, review-request and recorded-assessment relationships, including past reviews. Applications are ordered by applicationId. Pass each nextPage to this tool until null for the complete list. The application contactId identifies its current applicant contact.",
      inputSchema: contactApplicationListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        applications: z.array(contactApplicationSummarySchema),
        nextPage: contactApplicationListInput.required({ after: true }).nullable(),
      }),
    },
    async (input) => {
      const result = await grantmaking.listContactApplications(actor, input);
      return result.status === "ok" ? cursorPage(input, result) : result;
    },
  ),
  defineActorTool(
    actor,
    "list_application_reviews",
    {
      errorSchema: readingErrorSchema,
      description:
        "List current assessments and outstanding review requests in kind and UUID order with server-derived freshness and basisComparison. Use freshness to answer whether the reviewer used the current evidence: it compares the assessed application version and criteria content to the current record. A criteria revision with identical content stays current. The reviewer’s findings are their attributed judgment; corroboration against the submission is a separate question. Pass nextPage to this tool. Read a selected assessment or review_request through get_application_content using entryId; its history and provenance remain accessible. Use list_application_reviewers for assignment revisions and email delivery status.",
      inputSchema: reviewListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        reviews: z.array(reviewSummarySchema),
        nextPage: reviewListInput.required({ after: true }).nullable(),
      }),
    },
    async (input) => {
      const result = await grantmaking.listReviews(actor, input);
      return result.status === "ok" ? cursorPage(input, result) : result;
    },
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
      errorSchema: readingErrorSchema.extend({ message: z.string().optional() }),
      description:
        historicalMaterial +
        " Section submission reads current answers. Use section pdfs with materialVersion to list filenames, identifiers, and sizes of PDFs attached to that version. Uploads and file viewing are available in the browser. " +
        contentDescription +
        " Reviews retain requests, all assessment versions, their evidence bases and attribution. Null means that optional source is absent.",
      inputSchema: applicationContentInput,
      outputSchema: contentChunkSchema.extend({ sourceNote: z.string().optional() }),
    },
    async (input) => {
      const result = await grantmaking.applicationContent(actor, input);
      if (
        result.status === "invalid_range" &&
        input.section === "material" &&
        input.materialVersion === undefined
      ) {
        return {
          ...result,
          message: "Material snapshots require materialVersion. " + historicalMaterial,
        };
      }
      if (result.status === "ok" && input.section === "submission") {
        return {
          ...result,
          sourceNote: "Current answers can include later edits. " + historicalMaterial,
        };
      }
      return result;
    },
  ),
];

const createHistoryTools = (actor: Actor, grantmaking: GrantmakingOperations) => [
  defineActorTool(
    actor,
    "list_funding_round_history",
    {
      errorSchema: readingErrorSchema,
      description:
        "Walk through changes to a single round with this preparation history, earliest first. Budget entries include the previous amount, new amount and recorded reason. When nextPage is present, call list_funding_round_history with its arguments before summarizing the complete history. A null nextPage marks the final page. Fetch a selected change through get_funding_round_content.",
      inputSchema: roundHistoryInput,
      outputSchema: roundHistoryPageSchema.omit({ nextRevision: true }).extend({
        entries: z.array(roundHistoryToolEntrySchema),
        nextPage: roundHistoryInput.required({ afterRevision: true }).nullable(),
      }),
    },
    async (input) => {
      const result = await grantmaking.roundHistory(actor, input);
      return result.status === "ok"
        ? revisionPage(input, { ...result, entries: result.entries.map(presentRoundHistoryEntry) })
        : result;
    },
  ),
  defineActorTool(
    actor,
    "list_application_history",
    {
      errorSchema: readingErrorSchema,
      description:
        "List intake, recommendation, or committee decision changes in ascending revision order. Pass nextPage to this tool; fetch selected change content separately.",
      inputSchema: applicationHistoryInput,
      outputSchema: historyResult,
    },
    async (input) => {
      const result = await grantmaking.applicationHistory(actor, input);
      return result.status === "ok" ? revisionPage(input, result) : result;
    },
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
        "Read one page of round summaries in stable roundId order. When nextPage is present, call list_funding_rounds with its arguments before reporting a complete list or count. For a request to show every round, list each returned title individually so the user can identify each record. A null nextPage marks the final page. This is a live listing. Restart to see records inserted before the cursor.",
      inputSchema: roundListInput,
      outputSchema: roundListPageSchema.omit({ nextCursor: true }).extend({
        nextPage: roundListInput.required({ after: true }).nullable(),
      }),
    },
    async (input) => {
      const result = await grantmaking.listRoundSummaries(actor, input);
      return result.status === "ok" ? cursorPage(input, result) : result;
    },
  ),
  defineActorTool(
    actor,
    "get_funding_round",
    {
      errorSchema: readingErrorSchema,
      description:
        "Read round identity, preparation revision, manager and exact whole-round financial totals: requested, proposed (from recommendations), and committed and available (from recorded committee decisions). Totals include every application independently of list pagination. Use list_applications for records and get_funding_round_content for criteria and details.",
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
        "List who changed shared grant work across a workspace, newest first. Use list_funding_round_history for the ordered history of one round; it includes the actual budget changes. Covers round changes (creation, details, budget, criteria, manager, deletion), application changes (creation, content, summary, contact, readiness, revisions, corrections, deletion, shared working revisions), review requests and reviewer responses, assessments (recorded, corrected, submitted, amended), saved recommendations, and recorded committee decisions (an amended decision shows its explanation as the reason). Contact profiles, private reviewer drafts, and email delivery are outside this feed. Each entry gives the recorded person's name (null when none was recorded), the web or MCP-client provenance, the stored action name, and the record's current title and url, or a null record when it no longer exists. Optional roundId (the round and its applications, including their review requests, reviewer responses, assessments, recommendations, and committee decisions) and personId (a person from `people`) filters narrow the list; `people` lists everyone with recorded activity and is returned with the first page only (empty when `after` is given). Pass nextPage to this tool until null. Current program managers only.",
      inputSchema: workspaceActivityInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        entries: z.array(
          activityEntrySchema.extend({
            record: activityEntrySchema.shape.record.unwrap().extend({ url: z.url() }).nullable(),
          }),
        ),
        people: workspaceActivitySchema.shape.people,
        nextPage: workspaceActivityInput.required({ after: true }).nullable(),
      }),
    },
    async (input) => {
      const result = await grantmaking.listWorkspaceActivity(actor, input);
      return result.status === "ok"
        ? {
            ...cursorPage(input, result),
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
  ...createHistoryTools(actor, grantmaking),
];

export type { GrantmakingOperations } from "./operations";
