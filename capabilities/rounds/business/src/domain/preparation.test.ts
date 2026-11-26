import { describe, expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import type { FundingRound } from "./model";
import {
  budgetBelowCommitments,
  budgetChangeRequirements,
  newPreparedRound,
  prepareRoundChange,
  roundChangeSchema,
  withRoundManager,
} from "./preparation";
import { criteriaVersionSchema } from "./versions";

const makeRound = (overrides: Partial<FundingRound> = {}) => ({
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
  ])("names the creating manager using $expected", ({ name, email, expected }) => {
    expect(
      newPreparedRound({ title: "Round" }, { ...context, manager: { name, email } }).manager,
    ).toBe(expected);
  });

  it.each([
    { name: "Pat", email: "pat@example.org", expected: "Pat" },
    { name: null, email: "pat@example.org", expected: "pat@example.org" },
    { name: null, email: null, expected: "" },
  ])(
    "assigns a manager named $expected without changing the original round",
    ({ name, email, expected }) => {
      const round = newPreparedRound({ title: "Neighbourhood grants" }, context);
      const before = structuredClone(round);

      expect(withRoundManager(round, { userId: "pat", name, email })).toEqual({
        ...round,
        managerUserId: "pat",
        manager: expected,
      });
      expect(round).toEqual(before);
    },
  );
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

  it.each([
    { field: "purpose", cleared: { purpose: "" } },
    { field: "meeting date", cleared: { meetingDate: null } },
  ])("clears only the $field when the edit explicitly clears it", ({ cleared }) => {
    const round = makeRound({ purpose: "Support community projects", meetingDate: "2027-06-15" });

    expect(prepareRoundChange(round, { section: "details", ...cleared })).toEqual({
      ok: true,
      action: "details",
      reason: null,
      changed: true,
      round: { ...round, ...cleared },
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

  it("appends a criteria version when criteria change", () => {
    const criteria = [
      {
        id: "e2fbeb9f-4e46-5098-a28f-1e180f2129a0",
        title: "Fit",
        description: "Consider the purpose.",
      },
    ];

    expect(prepareRoundChange(makeRound(), { section: "criteria", criteria })).toMatchObject({
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
  });

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

  it("allows an explained reset to an unknown budget", () => {
    const round = makeRound({ budget: fromMinorUnits(10025n) });

    expect(
      prepareRoundChange(round, { section: "budget", amount: "", reason: "Allocation pending" }),
    ).toMatchObject({
      ok: true,
      action: "budget",
      reason: "Allocation pending",
      round: { budget: null },
    });
  });

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

describe("criterion identity", () => {
  const criterion = {
    id: "20000000-0000-4000-8000-000000000001",
    title: "Fit",
    description: "Connection to purpose",
  };
  const round = makeRound({
    criteria: [criterion],
    criteriaHistory: [{ version: criteriaVersionSchema.parse(1), criteria: [criterion] }],
  });

  it("keeps a criterion's ID when it is renamed", () => {
    const renamed = { ...criterion, title: "Purpose" };

    expect(prepareRoundChange(round, { section: "criteria", criteria: [renamed] })).toMatchObject({
      changed: true,
      round: {
        criteria: [renamed],
        criteriaHistory: [
          { version: 1, criteria: [criterion] },
          { version: 2, criteria: [renamed] },
        ],
      },
    });
  });

  it("records a replacement criterion with identical text as a change", () => {
    expect(
      prepareRoundChange(round, {
        section: "criteria",
        criteria: [{ ...criterion, id: "20000000-0000-4000-8000-000000000002" }],
      }),
    ).toMatchObject({ changed: true, round: { criteriaVersion: 2 } });
  });

  it("requires unique criterion IDs in a criteria change", () => {
    expect(
      roundChangeSchema.safeParse({ section: "criteria", criteria: [criterion, criterion] })
        .success,
    ).toBe(false);
    expect(
      roundChangeSchema.safeParse({ section: "criteria", criteria: [criterion] }).success,
    ).toBe(true);
  });
});

describe("round change limits", () => {
  const criterion = (overrides = {}) => ({
    id: "20000000-0000-4000-8000-000000000001",
    title: "Fit",
    description: "",
    ...overrides,
  });

  const criteria = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      criterion({ id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}` }),
    );

  it.each([
    {
      limit: "title",
      change: (length: number) => ({ section: "details", title: "a".repeat(length) }),
      at: 200,
    },
    {
      limit: "purpose",
      change: (length: number) => ({ section: "details", purpose: "a".repeat(length) }),
      at: 10000,
    },
    {
      limit: "criterion title",
      change: (length: number) => ({
        section: "criteria",
        criteria: [criterion({ title: "a".repeat(length) })],
      }),
      at: 200,
    },
    {
      limit: "criterion description",
      change: (length: number) => ({
        section: "criteria",
        criteria: [criterion({ description: "a".repeat(length) })],
      }),
      at: 5000,
    },
    {
      limit: "criteria count",
      change: (count: number) => ({ section: "criteria", criteria: criteria(count) }),
      at: 100,
    },
    {
      limit: "budget amount",
      change: (length: number) => ({ section: "budget", amount: "1".repeat(length), reason: "" }),
      at: 32,
    },
    {
      limit: "budget reason",
      change: (length: number) => ({ section: "budget", amount: "", reason: "a".repeat(length) }),
      at: 2000,
    },
    {
      limit: "manager ID",
      change: (length: number) => ({ section: "manager", userId: "a".repeat(length) }),
      at: 100,
    },
  ])("accepts a $limit up to $at and rejects one beyond it", ({ change, at }) => {
    expect(roundChangeSchema.safeParse(change(at)).success).toBe(true);
    expect(roundChangeSchema.safeParse(change(at + 1)).success).toBe(false);
  });

  it.each([
    { section: "a details", change: { section: "details", title: "Round", budget: "100" } },
    {
      section: "a criteria",
      change: { section: "criteria", criteria: [criterion()], reason: "Unrecorded" },
    },
    {
      section: "a criterion",
      change: { section: "criteria", criteria: [{ ...criterion(), weight: 2 }] },
    },
    { section: "a budget", change: { section: "budget", amount: "", reason: "", title: "Round" } },
    { section: "a manager", change: { section: "manager", userId: "pat", name: "Pat" } },
  ])("rejects fields that do not belong to $section change", ({ change }) => {
    expect(roundChangeSchema.safeParse(change).success).toBe(false);
  });
});

describe("budget and committed funding", () => {
  it.each([
    { budget: fromMinorUnits(6000000n), committed: fromMinorUnits(5200000n), below: false },
    { budget: fromMinorUnits(5200000n), committed: fromMinorUnits(5200000n), below: false },
    { budget: fromMinorUnits(5199999n), committed: fromMinorUnits(5200000n), below: true },
    { budget: null, committed: fromMinorUnits(1n), below: true },
    { budget: null, committed: fromMinorUnits(0n), below: false },
    { budget: fromMinorUnits(0n), committed: fromMinorUnits(0n), below: false },
  ])(
    "reports whether a budget of $budget is below commitments of $committed: $below",
    ({ budget, committed, below }) => {
      expect(budgetBelowCommitments(budget, committed)).toBe(below);
    },
  );
});
