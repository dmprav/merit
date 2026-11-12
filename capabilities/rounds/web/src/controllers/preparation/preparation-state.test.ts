import { expect, it } from "vite-plus/test";

import { roundView } from "@merit/grantmaking/api";
import { makeRound } from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits } from "@merit/money";

import {
  draftChange,
  hasPreparationChanges,
  hasPreparationDraft,
  preparationDraft,
  reconcilePreparation,
} from "./preparation-state";
import { preparationStorage } from "./storage";

it("merges untouched details while preserving the author's edits", () => {
  const round = roundView(makeRound({ purpose: "Support community projects" }));
  const draft = { ...preparationDraft("purpose", round, 0), value: { purpose: "My new purpose" } };
  const result = reconcilePreparation(
    draft,
    { ...round, title: "Colleague's title", meetingDate: "2027-04-01" },
    1,
  );

  expect(result.resolved).toBe(true);
  expect(result.conflicts).toEqual([]);
  expect(result.merged).toMatchObject({
    value: { purpose: "My new purpose" },
    baseline: { title: "Colleague's title", meetingDate: "2027-04-01" },
    revision: 1,
  });
  expect(result.merged.baseline.purpose).toBe(round.purpose);
});

it("requires an explicit choice only for actual collisions", () => {
  const round = roundView(makeRound({ purpose: "Original purpose" }));
  const draft = {
    ...preparationDraft("purpose", round, 0),
    value: { purpose: "Mine" },
  };
  const latest = { ...round, title: "Shared title", purpose: "Theirs" };

  expect(reconcilePreparation(draft, latest, 1)).toMatchObject({
    conflicts: ["purpose"],
    resolved: false,
  });
  expect(reconcilePreparation(draft, latest, 1, { purpose: "mine" }).merged.value.purpose).toBe(
    "Mine",
  );

  const saved = reconcilePreparation(draft, latest, 1, { purpose: "saved" });

  expect(saved.resolved).toBe(true);
  expect(hasPreparationChanges(saved.merged)).toBe(false);
});

it("ignores formatting-only changes but retains an unsaved budget reason", () => {
  const draft = preparationDraft(
    "budget",
    roundView(makeRound({ budget: fromMinorUnits(10000n) })),
    0,
  );

  expect(hasPreparationChanges({ ...draft, value: { ...draft.value, amount: "100.0" } })).toBe(
    false,
  );
  expect(
    hasPreparationDraft({
      ...draft,
      value: { ...draft.value, reason: "An unfinished explanation" },
    }),
  ).toBe(true);

  const details = preparationDraft("title", roundView(makeRound({ title: "Local grants" })), 0);

  expect(hasPreparationDraft({ ...details, value: { title: ` ${details.value.title} ` } })).toBe(
    false,
  );
});

it("treats reordered criteria as one deliberate choice without comparing editor keys", () => {
  const criteria = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      title: "Fit",
      description: "Connection to the purpose",
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      title: "Reach",
      description: "Who will participate",
    },
  ];
  const round = roundView(makeRound({ criteria, criteriaHistory: [{ version: 1, criteria }] }));
  const draft = preparationDraft("criteria", round, 0);

  expect(
    hasPreparationChanges({
      ...draft,
      value: {
        criteria: draft.value.criteria.map((item) => ({ ...item, key: crypto.randomUUID() })),
      },
    }),
  ).toBe(false);

  const edited = { ...draft, value: { criteria: [...draft.value.criteria].reverse() } };
  const latest = {
    ...round,
    criteria: [
      {
        id: "0630f26c-0567-518f-a61b-cbb1752ff2df",
        title: "New criterion",
        description: "New guidance",
      },
    ],
  };

  expect(reconcilePreparation(edited, latest, 1).conflicts).toEqual(["criteria"]);
  expect(
    reconcilePreparation(edited, latest, 1, { criteria: "saved" }).merged.value.criteria[0]?.title,
  ).toBe("New criterion");
});

it("preserves a reason-only draft across unrelated edits, clearing it when adopting a changed budget", () => {
  const round = roundView(makeRound({ budget: fromMinorUnits(10000n) }));
  const draft = {
    ...preparationDraft("budget", round, 0),
    value: { amount: "100.00", reason: "Preparing an allocation change" },
  };
  const unrelated = reconcilePreparation(draft, { ...round, title: "New title" }, 1);

  expect(unrelated.merged.value.reason).toBe(draft.value.reason);

  const changedBudget = { ...round, budget: fromMinorUnits(20000n) };
  const adopted = reconcilePreparation(
    { ...draft, value: { ...draft.value, amount: "300" } },
    changedBudget,
    1,
    {
      amount: "saved",
    },
  );

  expect(adopted.merged.value.reason).toBe("");
  expect(hasPreparationDraft(adopted.merged)).toBe(false);
});

it("sends only the chosen preparation field", () => {
  const round = roundView(
    makeRound({
      title: "Saved round",
      purpose: "Saved purpose",
      meetingDate: "2027-03-15",
    }),
  );
  const purpose = { ...preparationDraft("purpose", round, 3), value: { purpose: "Local purpose" } };
  const title = { ...preparationDraft("title", round, 3), value: { title: "Local title" } };

  expect(draftChange(title)).toEqual({
    section: "details",
    title: "Local title",
  });

  const reconciled = reconcilePreparation(purpose, { ...round, title: "Saved title" }, 4);

  expect(draftChange(reconciled.merged)).toEqual({
    section: "details",
    purpose: "Local purpose",
  });
  expect(purpose.baseline.title).toBe(round.title);
  expect(Object.keys(purpose.value)).toEqual(["purpose"]);
});

it.each(["title", "purpose", "meetingDate", "criteria", "budget", "manager"] as const)(
  "recovers the current %s draft with its original revision and baseline",
  (section) => {
    const draft = preparationDraft(section, roundView(makeRound()), 4);

    expect(preparationStorage.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  },
);

it("preserves criterion identity and the original baseline through editing and recovery", () => {
  const id = "20000000-0000-4000-8000-000000000001";
  const draft = preparationDraft(
    "criteria",
    roundView(makeRound({ criteria: [{ id, title: "Fit" }] })),
    4,
  );
  draft.value.criteria[0]!.title = "Renamed";
  expect(draft.baseline.criteria[0]).toMatchObject({ id, title: "Fit" });
  expect(draftChange(draft)).toMatchObject({ criteria: [{ id, title: "Renamed" }] });
  expect(preparationStorage.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  expect(() =>
    preparationStorage.parse({
      ...draft,
      value: { criteria: [{ key: "0", title: "Draft wording", description: "Unfinished" }] },
    }),
  ).toThrow();
});
