import { expect, it } from "vite-plus/test";

import { applicationsSearch, workspaceApplicationsLocation } from "./applications-location";

it("keeps the round and sorting while dropping search text, criteria, and detail parameters", () => {
  const search = applicationsSearch({
    round: "k7m2p9x4n6rt",
    sort: "application",
    direction: "descending",
    query: "private",
    filter: "awaiting",
    from: "applications",
    tab: "reviews",
  });
  expect(workspaceApplicationsLocation("alder", search)).toStrictEqual({
    to: "/app/$workspaceSlug/applications",
    params: { workspaceSlug: "alder" },
    search: {
      round: "k7m2p9x4n6rt",
      sort: "application",
      direction: "descending",
    },
  });
});

it.each([
  { round: ["k7m2p9x4n6rt"] },
  { round: "not-a-public-id" },
  { sort: "budget" },
  { direction: "sideways" },
])("drops the invalid value in %j", (search) => {
  expect(applicationsSearch(search)).toStrictEqual({
    round: undefined,
    sort: undefined,
    direction: undefined,
  });
});

it("omits the default ascending direction", () => {
  expect(applicationsSearch({ sort: "applicant", direction: "ascending" })).toStrictEqual({
    round: undefined,
    sort: "applicant",
    direction: undefined,
  });
});
