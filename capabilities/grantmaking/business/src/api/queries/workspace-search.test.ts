import { expect, it } from "vite-plus/test";

import {
  orderedSearchRecords,
  workspaceSearchInput,
  workspaceSearchSchema,
  type MatchQuality,
} from "./workspace-search";

const round = { id: "k7m2p9x4n6rt", title: "Community grants", meetingDate: null };
const application = {
  id: "b8q3w5j7c2df",
  title: "Workshop Saturdays",
  applicant: null,
  roundId: round.id,
  roundTitle: round.title,
  intakeStatus: "ready" as const,
  withdrawn: false,
};

const groups = (rounds: MatchQuality[], applications: MatchQuality[]) => ({
  rounds: {
    total: rounds.length,
    results: rounds.map((matchQuality) => ({ ...round, matchQuality })),
  },
  applications: {
    total: applications.length,
    results: applications.map((matchQuality) => ({ ...application, matchQuality })),
  },
});

it("accepts queries up to the limit and keeps typed text out of other fields", () => {
  const input = { workspaceSlug: "alder", query: "x".repeat(200) };

  expect(workspaceSearchInput.parse(input)).toEqual(input);
  expect(workspaceSearchInput.safeParse({ ...input, query: "x".repeat(201) }).success).toBe(false);
  expect(workspaceSearchInput.safeParse({ ...input, extra: true }).success).toBe(false);
});

it("keeps search results serializable and rejects unknown match qualities", () => {
  const search = { status: "ok", ...groups(["prefix"], ["exact", "contains"]) };

  expect(workspaceSearchSchema.parse(JSON.parse(JSON.stringify(search)))).toEqual(search);
  expect(
    workspaceSearchSchema.safeParse({
      ...search,
      rounds: { total: 1, results: [{ ...round, matchQuality: "fuzzy" }] },
    }).success,
  ).toBe(false);
});

it("merges exact, prefix and contains matches while preserving business ties and totals", () => {
  const search = {
    status: "ok" as const,
    ...groups(["exact", "contains", "contains"], ["exact", "prefix", "contains"]),
  };
  const result = orderedSearchRecords(search);
  expect(
    result.map((record) => [
      record.kind,
      record.kind === "round" ? record.round.matchQuality : record.application.matchQuality,
    ]),
  ).toEqual([
    ["round", "exact"],
    ["application", "exact"],
    ["application", "prefix"],
    ["round", "contains"],
    ["round", "contains"],
    ["application", "contains"],
  ]);
  expect(result[3]).toEqual({ kind: "round", round: search.rounds.results[1] });
  expect(search.rounds.total).toBe(3);
  expect(orderedSearchRecords({ status: "ok", ...groups([], []) })).toEqual([]);
});
