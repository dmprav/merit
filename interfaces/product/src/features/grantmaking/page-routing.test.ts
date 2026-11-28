import { assert, beforeEach, expect, it, vi } from "vite-plus/test";

import { encodeApplicationDetail, encodeRoundPage, roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";

import { resourceRef } from "./contracts/resource-url";
import { applicationsOptions } from "./data/queries";
import {
  readFundingApplicationPage,
  readFundingRoundPage,
  readWorkspaceApplications,
} from "./data/server/funding-round.functions";
import { loadApplicationPage, loadPublicPage } from "./page-routing";

vi.mock("./data/server/funding-round.functions", () => ({
  readFundingApplicationPage: vi.fn(),
  readFundingRoundPage: vi.fn(),
  readWorkspaceApplications: vi.fn(),
}));
const publicId = "b8q3w5j7c2df";
const round = roundView(
  makeRound({
    id: "k7m2p9x4n6rt",
    applications: [makeApplication({ id: publicId, title: "Workshop Saturdays" })],
  }),
);
const application = round.applications[0];
assert.isDefined(application);
const page = {
  status: "ok" as const,
  ...encodeApplicationDetail({
    round,
    application,
  }),
  recommendationVersion: 0,
  aiReviews: [],
  aiReviewAvailability: "available" as const,
  aiReviewProvider: null,
  decision: { revision: 0, versions: [] },
  intake: { revision: 0, workingRevision: null, history: [] },
  workspaceSlug: "alder",
};
beforeEach(() => vi.mocked(readFundingApplicationPage).mockReset());

it("keeps an authorized round available when its application list fails and retries the list", async () => {
  const client = createQueryClient();
  const roundPage = {
    status: "ok" as const,
    round: encodeRoundPage(round),
    workspaceSlug: "alder",
    preparation: { revision: 0, managers: [], budgetHistory: [] },
  };
  vi.mocked(readFundingRoundPage).mockResolvedValue(roundPage);
  vi.mocked(readWorkspaceApplications).mockRejectedValueOnce(new Error("List unavailable"));
  const ref = resourceRef(round.title, round.id);

  await expect(loadPublicPage(client, "alder", ref)).resolves.toEqual(roundPage);
  const options = applicationsOptions("alder", { roundId: round.id });
  expect(client.getQueryState(options.queryKey)?.status).toBe("error");

  const recovered = { status: "ok" as const, applications: [], total: 0, matching: 0, offset: 0 };
  vi.mocked(readWorkspaceApplications).mockResolvedValueOnce(recovered);
  await expect(client.fetchQuery(options)).resolves.toEqual(recovered);
});

it("redirects stale titles and ID-only links after authorization, retaining review state", async () => {
  vi.mocked(readFundingApplicationPage).mockResolvedValue(page);

  for (const ref of [`old-title-${publicId}`, publicId]) {
    await expect(
      loadApplicationPage(createQueryClient(), "alder", ref, { tab: "reviews" }),
    ).rejects.toMatchObject({
      status: 302,
      options: {
        to: "/app/$workspaceSlug/applications/$applicationRef",
        params: { workspaceSlug: "alder", applicationRef: `workshop-saturdays-${publicId}` },
        search: { tab: "reviews" },
        replace: true,
      },
    });
  }

  expect(
    await loadApplicationPage(createQueryClient(), "alder", `workshop-saturdays-${publicId}`),
  ).toEqual(page);
});

it("does not reveal canonical titles for denied or missing resources", async () => {
  vi.mocked(readFundingApplicationPage).mockResolvedValue({ status: "not_found" });

  expect(await loadApplicationPage(createQueryClient(), "birch", `old-title-${publicId}`)).toEqual({
    status: "not_found",
  });

  const [readCall] = vi.mocked(readFundingApplicationPage).mock.calls;

  assert.isDefined(readCall);
  expect(readCall[0].signal).toBeInstanceOf(AbortSignal);
  expect(readCall[0].data).toEqual({ workspaceSlug: "birch", publicId });
});

it("rejects invalid identities before querying the application", async () => {
  expect(await loadApplicationPage(createQueryClient(), "alder", "old-title-A3")).toEqual({
    status: "not_found",
  });
  expect(await loadApplicationPage(createQueryClient(), "sign-in", publicId)).toEqual({
    status: "not_found",
  });
  expect(readFundingApplicationPage).not.toHaveBeenCalled();
});
