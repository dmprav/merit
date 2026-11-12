import { expect, it } from "vite-plus/test";

import { applicationsSearch, workspaceApplicationsLocation } from "./applications-location";

it("preserves a valid application list location while discarding unrelated search data", () => {
  const search = applicationsSearch({
    round: "k7m2p9x4n6rt",
    sort: "application",
    direction: "descending",
    from: "applications",
    tab: "reviews",
  });
  expect(workspaceApplicationsLocation("alder", search)).toEqual({
    to: "/app/$workspaceSlug/applications",
    params: { workspaceSlug: "alder" },
    search: { round: "k7m2p9x4n6rt", sort: "application", direction: "descending" },
  });
});

it("discards invalid round and sort parameters", () => {
  expect(applicationsSearch({ round: ["other"], sort: "budget", direction: "sideways" })).toEqual({
    round: undefined,
    sort: undefined,
    direction: undefined,
  });
});
