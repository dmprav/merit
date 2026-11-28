import { describe, expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { makePreparationRound } from "../../testing/fixtures";
import {
  draftChange,
  hasPreparationChanges,
  hasPreparationDraft,
  hasPreparationSectionConflict,
  preparationDraft,
  rebasePreparationDraft,
} from "./preparation-state";
import { preparationStorage } from "./storage";

const fit = {
  id: "20000000-0000-4000-8000-000000000001",
  title: "Fit",
  description: "Connection to the purpose",
};
const reach = {
  id: "20000000-0000-4000-8000-000000000002",
  title: "Reach",
  description: "Who will participate",
};

const criteriaRound = () =>
  makePreparationRound({
    criteria: [fit, reach],
  });

describe("unsaved changes", () => {
  it("ignores a budget amount that differs only in formatting", () => {
    const draft = preparationDraft(
      "budget",
      makePreparationRound({ budget: fromMinorUnits(10000n) }),
      0,
    );

    expect(hasPreparationChanges({ ...draft, value: { ...draft.value, amount: "100.0" } })).toBe(
      false,
    );
  });

  it("ignores surrounding whitespace in a title", () => {
    const draft = preparationDraft("title", makePreparationRound({ title: "Local grants" }), 0);

    expect(hasPreparationDraft({ ...draft, value: { title: " Local grants " } })).toBe(false);
  });

  it("ignores surrounding whitespace in criteria", () => {
    const draft = preparationDraft("criteria", criteriaRound(), 0);

    expect(
      hasPreparationChanges({
        ...draft,
        value: {
          criteria: draft.value.criteria.map((item) => ({
            ...item,
            title: ` ${item.title} `,
            description: `${item.description} `,
          })),
        },
      }),
    ).toBe(false);
  });

  it("ignores criterion editor keys", () => {
    const draft = preparationDraft("criteria", criteriaRound(), 0);

    expect(
      hasPreparationChanges({
        ...draft,
        value: {
          criteria: draft.value.criteria.map((item) => ({ ...item, key: crypto.randomUUID() })),
        },
      }),
    ).toBe(false);
  });

  it("retains a budget draft containing only an unsaved reason", () => {
    const draft = preparationDraft(
      "budget",
      makePreparationRound({ budget: fromMinorUnits(10000n) }),
      0,
    );

    expect(
      hasPreparationDraft({
        ...draft,
        value: { ...draft.value, reason: "An unfinished explanation" },
      }),
    ).toBe(true);
  });
});

describe("detecting collisions against a newer saved round", () => {
  it("ignores edits in unrelated sections and preserves the author's draft", () => {
    const round = makePreparationRound({ purpose: "Support community projects" });
    const draft = {
      ...preparationDraft("purpose", round, 0),
      value: { purpose: "My new purpose" },
    };
    const latest = { ...round, title: "Colleague's title", meetingDate: "2027-04-01" };

    expect(hasPreparationSectionConflict(draft, latest)).toBe(false);
    expect(rebasePreparationDraft(draft, latest, 1)).toMatchObject({
      value: { purpose: "My new purpose" },
      baseline: { title: "Colleague's title", meetingDate: "2027-04-01" },
      revision: 1,
    });
  });

  it("does not flag a collision when the author has not changed their field yet", () => {
    const round = makePreparationRound({ purpose: "Original purpose" });
    const draft = preparationDraft("purpose", round, 0);

    expect(hasPreparationSectionConflict(draft, { ...round, purpose: "Updated elsewhere" })).toBe(
      false,
    );
  });

  it("does not flag a collision when a colleague saved the same value", () => {
    const round = makePreparationRound({ purpose: "Original purpose" });
    const draft = { ...preparationDraft("purpose", round, 0), value: { purpose: "Agreed" } };

    expect(hasPreparationSectionConflict(draft, { ...round, purpose: "Agreed" })).toBe(false);
    const rebased = rebasePreparationDraft(draft, { ...round, purpose: "Agreed" }, 1);
    expect(hasPreparationChanges(rebased)).toBe(false);
  });

  describe("when both authors changed the same field", () => {
    const round = makePreparationRound({ purpose: "Original purpose" });
    const draft = { ...preparationDraft("purpose", round, 0), value: { purpose: "Mine" } };
    const latest = { ...round, title: "Shared title", purpose: "Theirs" };

    it("detects the collision", () => {
      expect(hasPreparationSectionConflict(draft, latest)).toBe(true);
    });

    it("rebases the author's draft onto the latest revision when kept", () => {
      expect(rebasePreparationDraft(draft, latest, 1)).toMatchObject({
        revision: 1,
        value: { purpose: "Mine" },
        baseline: { purpose: "Theirs" },
      });
    });

    it("leaves no unsaved change when replacing with a fresh latest draft", () => {
      const saved = preparationDraft("purpose", latest, 1);

      expect(saved.value.purpose).toBe("Theirs");
      expect(hasPreparationChanges(saved)).toBe(false);
    });
  });

  describe("when criteria were reordered locally and replaced by a colleague", () => {
    const round = criteriaRound();
    const draft = preparationDraft("criteria", round, 0);
    const edited = { ...draft, value: { criteria: [...draft.value.criteria].reverse() } };
    const replacement = {
      id: "0630f26c-0567-518f-a61b-cbb1752ff2df",
      title: "New criterion",
      description: "New guidance",
    };
    const latest = { ...round, criteria: [replacement] };

    it("treats the ordered list as one collision", () => {
      expect(hasPreparationSectionConflict(edited, latest)).toBe(true);
    });

    it("adopts the whole saved list when replacing with latest", () => {
      expect(preparationDraft("criteria", latest, 1).value.criteria).toEqual([
        { key: replacement.id, ...replacement },
      ]);
    });
  });

  describe("a budget draft with an unsaved reason", () => {
    const round = makePreparationRound({ budget: fromMinorUnits(10000n) });
    const draft = {
      ...preparationDraft("budget", round, 0),
      value: { amount: "100.00", reason: "Preparing an allocation change" },
    };

    it("keeps the reason across unrelated edits", () => {
      expect(rebasePreparationDraft(draft, { ...round, title: "New title" }, 1).value.reason).toBe(
        draft.value.reason,
      );
    });

    it("clears the reason when resetting to the latest saved budget", () => {
      const adopted = preparationDraft("budget", { ...round, budget: fromMinorUnits(20000n) }, 1);

      expect(adopted.value).toEqual({ amount: "200.00", reason: "" });
      expect(hasPreparationDraft(adopted)).toBe(false);
    });
  });
});

describe("save commands", () => {
  const round = makePreparationRound({
    title: "Saved round",
    purpose: "Saved purpose",
    meetingDate: "2027-03-15",
  });

  it("sends only the edited title", () => {
    const title = { ...preparationDraft("title", round, 3), value: { title: "Local title" } };

    expect(draftChange(title)).toEqual({ section: "details", title: "Local title" });
  });

  it("sends only the edited purpose after rebasing past a colleague's title", () => {
    const purpose = {
      ...preparationDraft("purpose", round, 3),
      value: { purpose: "Local purpose" },
    };
    const rebased = rebasePreparationDraft(purpose, { ...round, title: "Saved title" }, 4);

    expect(draftChange(rebased)).toEqual({
      section: "details",
      purpose: "Local purpose",
    });
  });

  it("sends a cleared committee date as no date", () => {
    const draft = { ...preparationDraft("meetingDate", round, 3), value: { meetingDate: "" } };

    expect(draftChange(draft)).toEqual({ section: "details", meetingDate: null });
  });

  it("keeps a renamed criterion's ID and the original baseline", () => {
    const draft = preparationDraft("criteria", criteriaRound(), 4);
    draft.value.criteria[0]!.title = "Renamed";

    expect(draft.baseline.criteria[0]).toMatchObject({ id: fit.id, title: "Fit" });
    expect(draftChange(draft)).toEqual({
      section: "criteria",
      criteria: [{ ...fit, title: "Renamed" }, reach],
    });
  });
});

describe("draft recovery", () => {
  it.each(["title", "purpose", "meetingDate", "criteria", "budget", "manager"] as const)(
    "recovers the current %s draft with its original revision and baseline",
    (section) => {
      const draft = preparationDraft(section, makePreparationRound(), 4);

      expect(preparationStorage.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    },
  );

  it("recovers an edited criteria draft with its criterion IDs", () => {
    const draft = preparationDraft("criteria", criteriaRound(), 4);
    draft.value.criteria[0]!.title = "Renamed";

    expect(preparationStorage.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });

  it("rejects a stored criteria draft without criterion IDs", () => {
    const draft = preparationDraft("criteria", criteriaRound(), 4);

    expect(() =>
      preparationStorage.parse({
        ...draft,
        value: { criteria: [{ key: "0", title: "Draft wording", description: "Unfinished" }] },
      }),
    ).toThrow();
  });
});
