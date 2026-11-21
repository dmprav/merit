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
    results: rounds.map((matchQuality, index) => ({
      ...round,
      title: `Round ${rounds.length - index}`,
      matchQuality,
    })),
  },
  applications: {
    total: applications.length,
    results: applications.map((matchQuality, index) => ({
      ...application,
      title: `Application ${applications.length - index}`,
      matchQuality,
    })),
  },
});

const input = { workspaceSlug: "alder", query: "x".repeat(200) };

it("accepts a query of up to 200 characters", () => {
  expect(workspaceSearchInput.parse(input)).toEqual(input);
});

it("rejects a query over 200 characters", () => {
  expect(workspaceSearchInput.safeParse({ ...input, query: "x".repeat(201) }).success).toBe(false);
});

it("keeps typed text out of fields the request does not define", () => {
  expect(workspaceSearchInput.safeParse({ ...input, extra: true }).success).toBe(false);
});

it("keeps search results serializable", () => {
  const search = { status: "ok", ...groups(["prefix"], ["exact", "contains"]) };

  expect(workspaceSearchSchema.parse(JSON.parse(JSON.stringify(search)))).toEqual(search);
});

it("rejects an unknown match quality", () => {
  const search = {
    status: "ok",
    ...groups([], []),
    rounds: { total: 1, results: [{ ...round, matchQuality: "fuzzy" }] },
  };

  expect(workspaceSearchSchema.safeParse(search).success).toBe(false);
});

it("merges exact, prefix and contains matches, rounds first and in server order within a quality", () => {
  const search = {
    status: "ok" as const,
    ...groups(["exact", "contains", "contains"], ["contains", "prefix", "exact"]),
  };

  const [exactRound, firstContainsRound, secondContainsRound] = search.rounds.results;
  const [containsApplication, prefixApplication, exactApplication] = search.applications.results;

  expect(orderedSearchRecords(search)).toEqual([
    { kind: "round", round: exactRound },
    { kind: "application", application: exactApplication },
    { kind: "application", application: prefixApplication },
    { kind: "round", round: firstContainsRound },
    { kind: "round", round: secondContainsRound },
    { kind: "application", application: containsApplication },
  ]);
});

it("merges empty groups into no records", () => {
  expect(orderedSearchRecords({ status: "ok", ...groups([], []) })).toEqual([]);
});
