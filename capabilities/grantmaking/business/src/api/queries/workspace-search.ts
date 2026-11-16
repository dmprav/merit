import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
import { workspaceSlugSchema } from "@merit/organizations/api";
import { fundingRoundSchema } from "@merit/rounds/domain";

import { applicationOverviewSchema } from "./application-overview";

/** The longest query the search accepts. */
export const workspaceSearchQueryLimit = 200;

/** The most records shown per group; each group also reports its total number of matches. */
export const workspaceSearchLimits = { rounds: 5, applications: 10 } as const;

export const workspaceSearchInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  /** Typed text: sent in a request body and never logged, so it stays out of URLs and history. */
  query: z.string().max(workspaceSearchQueryLimit),
});

/** How a record matched: a field equals the whole query, starts with it, or contains every word. */
export const matchQualitySchema = z.enum(["exact", "prefix", "contains"]);

export type MatchQuality = z.infer<typeof matchQualitySchema>;

export const searchedRoundSchema = z.object({
  id: publicIdSchema,
  title: z.string(),
  meetingDate: fundingRoundSchema.shape.meetingDate,
  matchQuality: matchQualitySchema,
});

export const searchedApplicationSchema = applicationOverviewSchema
  .pick({
    id: true,
    title: true,
    applicant: true,
    roundId: true,
    roundTitle: true,
    intakeStatus: true,
    withdrawn: true,
  })
  .extend({ matchQuality: matchQualitySchema });

const group = <Result extends z.ZodType>(result: Result) =>
  z.object({ results: z.array(result), total: z.number().int().nonnegative() });

export const workspaceSearchSchema = z.object({
  status: z.literal("ok"),
  rounds: group(searchedRoundSchema),
  applications: group(searchedApplicationSchema),
});

export type SearchedRound = z.infer<typeof searchedRoundSchema>;

export type SearchedApplication = z.infer<typeof searchedApplicationSchema>;

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;

/** Lower numbers are stronger matches, shared by record and interface result ordering. */
export const searchMatchRank = (quality: MatchQuality): number =>
  ({ exact: 0, prefix: 1, contains: 2 })[quality];

export type SearchRecord =
  | { kind: "round"; round: SearchedRound }
  | { kind: "application"; application: SearchedApplication };

/** Merge returned records by match quality, preserving each group's business order.
 * Equal-quality rounds precede applications; per-type limits and totals remain unchanged. */
export const orderedSearchRecords = (search: WorkspaceSearch): SearchRecord[] =>
  [
    ...search.rounds.results.map((round) => ({ kind: "round" as const, round })),
    ...search.applications.results.map((application) => ({
      kind: "application" as const,
      application,
    })),
  ].sort(
    (a, b) =>
      searchMatchRank(a.kind === "round" ? a.round.matchQuality : a.application.matchQuality) -
      searchMatchRank(b.kind === "round" ? b.round.matchQuality : b.application.matchQuality),
  );
