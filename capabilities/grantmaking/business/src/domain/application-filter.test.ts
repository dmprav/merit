import { expect, it } from "vite-plus/test";

import {
  matchesApplicationCriteria,
  type ApplicationFilter,
  type ApplicationFilterFacts,
} from "./application-filter";

const facts: ApplicationFilterFacts = {
  withdrawn: true,
  intakeStatus: "ready",
  reviews: { current: 0, outdated: 1, unknown: 1, outstanding: 1 },
  criteriaChanged: false,
  recommendation: { outdated: true },
};

it.each<[ApplicationFilter, boolean]>([
  [{}, true],
  [{ participation: "active" }, false],
  [{ participation: "withdrawn" }, true],
  [{ readiness: "ready" }, true],
  [{ readiness: "preparing" }, false],
  [{ reviews: "awaiting" }, true],
  [{ reviews: "unassigned" }, false],
  [{ evidence: "changed" }, true],
  [{ evidence: "unknown" }, true],
  [{ recommendation: "missing" }, false],
  [
    { participation: "withdrawn", readiness: "ready", reviews: "awaiting", evidence: "changed" },
    true,
  ],
  [
    { participation: "active", readiness: "ready", reviews: "awaiting", evidence: "changed" },
    false,
  ],
  [{ readiness: "ready", reviews: "awaiting", recommendation: "missing" }, false],
])("combines independent application criteria with AND: %j", (filter, expected) => {
  expect(matchesApplicationCriteria(facts, filter)).toBe(expected);
});

const unreviewed = {
  ...facts,
  reviews: { current: 0, outdated: 0, outstanding: 0, unknown: 0 },
  recommendation: null,
};

it("matches missing recommendations and reviewers independently of participation", () => {
  expect(
    matchesApplicationCriteria(unreviewed, { reviews: "unassigned", recommendation: "missing" }),
  ).toBe(true);
  expect(matchesApplicationCriteria(unreviewed, { reviews: "awaiting" })).toBe(false);
  expect(matchesApplicationCriteria(unreviewed, { evidence: "unknown" })).toBe(false);
  expect(matchesApplicationCriteria(unreviewed, { evidence: "changed" })).toBe(false);
  expect(
    matchesApplicationCriteria(
      { ...unreviewed, intakeStatus: "in_preparation" },
      { readiness: "preparing" },
    ),
  ).toBe(true);
});

it("treats outdated reviews, changed criteria, and earlier recommendations as changed evidence", () => {
  expect(matchesApplicationCriteria(unreviewed, { evidence: "changed" })).toBe(false);
  expect(
    matchesApplicationCriteria(
      { ...unreviewed, recommendation: { outdated: false } },
      { evidence: "changed" },
    ),
  ).toBe(false);
  expect(
    matchesApplicationCriteria(
      { ...unreviewed, recommendation: { outdated: true } },
      { evidence: "changed" },
    ),
  ).toBe(true);
  expect(
    matchesApplicationCriteria({ ...unreviewed, criteriaChanged: true }, { evidence: "changed" }),
  ).toBe(true);
  expect(
    matchesApplicationCriteria(
      { ...unreviewed, reviews: { ...unreviewed.reviews, outdated: 1 } },
      { evidence: "changed" },
    ),
  ).toBe(true);
});
