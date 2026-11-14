import { z } from "zod";

import { workspaceSlugSchema } from "@merit/organizations/api";
import { fundingRoundSchema } from "@merit/rounds/domain";

import { publicIdSchema } from "../identifiers";
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

/** Funding rounds come first, unless only the applications hold an exact match. */
export const searchGroupOrder = (
  search: Pick<WorkspaceSearch, "rounds" | "applications">,
): ["rounds", "applications"] | ["applications", "rounds"] => {
  const exact = (results: { matchQuality: MatchQuality }[]) =>
    results.some((result) => result.matchQuality === "exact");

  return exact(search.applications.results) && !exact(search.rounds.results)
    ? ["applications", "rounds"]
    : ["rounds", "applications"];
};
