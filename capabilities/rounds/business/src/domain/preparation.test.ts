import { describe, expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import type { FundingRound } from "./model";
import { criteriaVersionSchema } from "./versions";

const makeRound = (overrides: Partial<FundingRound> & { applications?: unknown[] } = {}) => ({
  ...newPreparedRound(
    { title: "Community grants" },
    {
      id: "round",
      foundation: "Alder",
      manager: { name: "Dana", email: null },
      snapshotDate: "2027-03-15",
    },
  ),
  ...overrides,
});

const makeApplication = () => ({ id: "application" });

const makeReviewedApplication = () => ({ id: "application", reviews: [{ reasoning: "Support" }] });

import {
  budgetChangeRequirements,
  newPreparedRound,
  prepareRoundChange,
  roundChangeSchema,
  withRoundManager,
} from "./preparation";

describe("initial round preparation", () => {
  const context = {
    id: "round",
    foundation: "Alder",
    manager: { name: "Dana", email: "dana@example.org" },
    snapshotDate: "2027-03-15",
  };

  it("starts with undecided preparation and an empty first criteria version", () => {
    expect(newPreparedRound({ title: "Neighbourhood grants" }, context)).toEqual({
      id: "round",
      title: "Neighbourhood grants",
      foundation: "Alder",
      purpose: "",
      manager: "Dana",
      currency: "EUR",
      budget: null,
      meetingDate: null,
      snapshotDate: "2027-03-15",
      decisionStatus: "Preparing",
      criteria: [],
      criteriaVersion: 1,
      criteriaHistory: [{ version: 1, criteria: [] }],
    });
  });

  it.each([
    { budget: "0", expected: fromMinorUnits(0n) },
    { budget: "100.25", expected: fromMinorUnits(10025n) },
    { budget: "", expected: null },
    { budget: "invalid", expected: null },
  ])("records supplied details with budget $budget", ({ budget, expected }) => {
    expect(
      newPreparedRound(
        {
          title: "Neighbourhood grants",
          purpose: "Community work",
          meetingDate: "2027-06-15",
          budget,
        },
        context,
      ),
    ).toMatchObject({ purpose: "Community work", meetingDate: "2027-06-15", budget: expected });
  });

  it.each([
    { name: "Pat", email: "pat@example.org", expected: "Pat" },
    { name: null, email: "pat@example.org", expected: "pat@example.org" },
    { name: null, email: null, expected: "" },
  ])("captures manager details using $expected", ({ name, email, expected }) => {
    const manager = { userId: "pat", name, email };
    const round = newPreparedRound({ title: "Neighbourhood grants" }, context);
    const before = structuredClone(round);

    expect(withRoundManager(round, manager)).toEqual({
      ...round,
      managerUserId: "pat",
      manager: expected,
    });
    expect(round).toEqual(before);
    expect(newPreparedRound({ title: "Round" }, { ...context, manager }).manager).toBe(expected);
  });
});

describe("round preparation", () => {
  it.each(["dana", "sam"])(
    "detects whether manager %s changes the current responsibility",
    (userId) => {
      const round = makeRound({ managerUserId: "dana" });

      expect(prepareRoundChange(round, { section: "manager", userId })).toEqual({
        ok: true,
        action: "manager",
        reason: null,
        changed: userId !== "dana",
        round,
      });
    },
  );

  it("treats missing and empty criterion descriptions as the same recorded criteria", () => {
    const criteria = [{ id: "e2fbeb9f-4e46-5098-a28f-1e180f2129a0", title: "Fit" }];
    const round = makeRound({
      criteria,
      criteriaHistory: [{ version: criteriaVersionSchema.parse(1), criteria }],
    });

    expect(
      prepareRoundChange(round, {
        section: "criteria",
        criteria: [{ id: "e2fbeb9f-4e46-5098-a28f-1e180f2129a0", title: "Fit", description: "" }],
      }),
    ).toEqual({ ok: true, action: "criteria", reason: null, changed: false, round });
  });

  it("renames a round without changing its purpose or meeting date", () => {
    const round = makeRound({ purpose: "Support community projects", meetingDate: "2027-06-15" });

    expect(prepareRoundChange(round, { section: "details", title: "New title" })).toEqual({
      ok: true,
      action: "details",
      reason: null,
      changed: true,
      round: { ...round, title: "New title" },
    });
  });

  it("clears purpose and meeting date when the edit explicitly clears them", () => {
    const round = makeRound({ purpose: "Support community projects", meetingDate: "2027-06-15" });

    expect(
      prepareRoundChange(round, { section: "details", purpose: "", meetingDate: null }),
    ).toEqual({
      ok: true,
      action: "details",
      reason: null,
      changed: true,
      round: { ...round, purpose: "", meetingDate: null },
    });
  });

  it("reports no change when the title is unchanged", () => {
    const round = makeRound();

    expect(prepareRoundChange(round, { section: "details", title: round.title })).toMatchObject({
      changed: false,
    });
  });

  it("rejects a details edit with no supplied fields", () => {
    expect(roundChangeSchema.safeParse({ section: "details" }).success).toBe(false);
  });

  it.each([
    { current: null, next: null, previouslySet: false, changed: false, reasonRequired: false },
    { current: null, next: 0n, previouslySet: false, changed: true, reasonRequired: false },
    { current: null, next: 0n, previouslySet: true, changed: true, reasonRequired: true },
    { current: null, next: null, previouslySet: true, changed: false, reasonRequired: false },
    { current: 0n, next: null, previouslySet: false, changed: true, reasonRequired: true },
    { current: 100n, next: 100n, previouslySet: true, changed: false, reasonRequired: false },
    { current: 100n, next: 200n, previouslySet: false, changed: true, reasonRequired: true },
  ])(
    "explains budget changes from $current to $next (previously set: $previouslySet)",
    ({ current, next, previouslySet, changed, reasonRequired }) => {
      const before = current === null ? null : fromMinorUnits(current);
      const after = next === null ? null : fromMinorUnits(next);

      expect(budgetChangeRequirements(before, after, previouslySet)).toEqual({
        changed,
        reasonRequired,
      });
      expect(
        prepareRoundChange(
          makeRound({ budget: before }),
          {
            section: "budget",
            amount: next === null ? "" : (Number(next) / 100).toFixed(2),
            reason: "",
          },
          previouslySet,
        ),
      ).toMatchObject(
        reasonRequired
          ? { ok: false, error: "budget_reason_required" }
          : { ok: true, changed, round: { budget: after } },
      );
    },
  );

  it.each([false, true])(
    "appends a criteria version when criteria change, with existing reviews=%s",
    (hasReviews) => {
      const criteria = [
        {
          id: "e2fbeb9f-4e46-5098-a28f-1e180f2129a0",
          title: "Fit",
          description: "Consider the purpose.",
        },
      ];
      const round = makeRound({ applications: hasReviews ? [makeReviewedApplication()] : [] });

      const result = prepareRoundChange(round, { section: "criteria", criteria });

      expect(result).toMatchObject({
        ok: true,
        changed: true,
        round: {
          criteriaVersion: 2,
          criteriaHistory: [
            { version: 1, criteria: [] },
            { version: 2, criteria },
          ],
        },
      });
    },
  );

  it("does not append a version when criteria are unchanged", () => {
    const criteria = [
      {
        id: "e2fbeb9f-4e46-5098-a28f-1e180f2129a0",
        title: "Fit",
        description: "Consider the purpose.",
      },
    ];
    const round = makeRound({
      criteria,
      criteriaVersion: criteriaVersionSchema.parse(2),
      criteriaHistory: [
        { version: criteriaVersionSchema.parse(1), criteria: [] },
        { version: criteriaVersionSchema.parse(2), criteria },
      ],
    });

    expect(prepareRoundChange(round, { section: "criteria", criteria })).toEqual({
      ok: true,
      action: "criteria",
      reason: null,
      changed: false,
      round,
    });
  });

  it("sets an initial budget with exact cents without requiring an explanation", () => {
    expect(
      prepareRoundChange(makeRound(), { section: "budget", amount: "100.25", reason: "" }),
    ).toMatchObject({
      ok: true,
      action: "budget",
      reason: null,
      round: { budget: fromMinorUnits(10025n) },
    });
  });

  it("requires an explanation when replacing an existing budget", () => {
    const round = makeRound({ budget: fromMinorUnits(10025n) });

    expect(prepareRoundChange(round, { section: "budget", amount: "0", reason: "" })).toEqual({
      ok: false,
      error: "budget_reason_required",
    });
  });

  it.each([false, true])(
    "allows an explained reset to an unknown budget, with applications=%s",
    (hasApplications) => {
      const round = makeRound({
        budget: fromMinorUnits(10025n),
        applications: hasApplications ? [makeApplication()] : [],
      });

      expect(
        prepareRoundChange(round, { section: "budget", amount: "", reason: "Allocation pending" }),
      ).toMatchObject({
        ok: true,
        action: "budget",
        reason: "Allocation pending",
        round: { budget: null },
      });
    },
  );

  it.each(["1.001", "-1", "1e3", "NaN"])("rejects invalid budget %s", (amount) => {
    expect(prepareRoundChange(makeRound(), { section: "budget", amount, reason: "" })).toEqual({
      ok: false,
      error: "invalid_budget",
    });
  });

  it.each([
    {
      reason: "a blank title",
      change: { section: "details", title: " ", purpose: "", meetingDate: null },
    },
    {
      reason: "an impossible calendar date",
      change: { section: "details", title: "Round", purpose: "", meetingDate: "2027-02-30" },
    },
    {
      reason: "a blank criterion title",
      change: {
        section: "criteria",
        criteria: [{ id: "3ed5c4a6-c978-5309-aa6d-9679b7280377", title: " ", description: "" }],
      },
    },
  ])("rejects $reason", ({ change }) => {
    expect(roundChangeSchema.safeParse(change).success).toBe(false);
  });
});

it("keeps criterion identity through renaming, and records an identical-text replacement", () => {
  const id = "20000000-0000-4000-8000-000000000001";
  const criterion = { id, title: "Fit", description: "Connection to purpose" };
  const round = makeRound({
    criteria: [criterion],
    criteriaHistory: [{ version: criteriaVersionSchema.parse(1), criteria: [criterion] }],
  });
  const renamed = { ...criterion, title: "Purpose" };
  const changed = prepareRoundChange(round, { section: "criteria", criteria: [renamed] });
  expect(changed).toMatchObject({
    changed: true,
    round: {
      criteria: [renamed],
      criteriaHistory: [
        { version: 1, criteria: [criterion] },
        { version: 2, criteria: [renamed] },
      ],
    },
  });
  expect(
    prepareRoundChange(round, {
      section: "criteria",
      criteria: [{ ...criterion, id: "20000000-0000-4000-8000-000000000002" }],
    }),
  ).toMatchObject({ changed: true });
  expect(
    roundChangeSchema.safeParse({ section: "criteria", criteria: [criterion, criterion] }).success,
  ).toBe(false);
  expect(roundChangeSchema.safeParse({ section: "criteria", criteria: [criterion] }).success).toBe(
    true,
  );
});
