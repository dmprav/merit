import { expect, it } from "vite-plus/test";

import {
  searchGroupOrder,
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

it.each([
  { rounds: [], applications: [], order: ["rounds", "applications"] },
  { rounds: ["contains"], applications: ["contains"], order: ["rounds", "applications"] },
  { rounds: ["exact"], applications: ["exact"], order: ["rounds", "applications"] },
  { rounds: ["exact"], applications: ["prefix"], order: ["rounds", "applications"] },
  { rounds: ["prefix"], applications: ["exact"], order: ["applications", "rounds"] },
  { rounds: [], applications: ["contains", "exact"], order: ["applications", "rounds"] },
] satisfies { rounds: MatchQuality[]; applications: MatchQuality[]; order: string[] }[])(
  "orders groups $order for rounds $rounds and applications $applications",
  ({ rounds, applications, order }) => {
    expect(searchGroupOrder(groups(rounds, applications))).toEqual(order);
  },
);
