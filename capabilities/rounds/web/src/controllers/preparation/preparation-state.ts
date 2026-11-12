import type { z } from "zod";

import type { RoundView } from "@merit/grantmaking/api";
import { toDecimal } from "@merit/money";
import { parseMoneyInput } from "@merit/money/input";
import type { RoundChange } from "@merit/rounds/domain";

import type { preparationStorage } from "./storage";

export type PreparationDraft = z.infer<typeof preparationStorage>;

export type PreparationSection = PreparationDraft["section"];

export type PreparationSnapshot = PreparationDraft["baseline"];

export type PreparationField = keyof PreparationSnapshot;

export type PreparationValues = {
  [S in PreparationSection]: Extract<PreparationDraft, { section: S }>["value"];
};

export type PreparationSectionDraft<S extends PreparationSection> = Omit<
  PreparationDraft,
  "section" | "value"
> & { section: S; value: PreparationValues[S] };

const sectionValue = <S extends PreparationSection>(
  section: S,
  values: PreparationSnapshot,
  reason = "",
): PreparationValues[S] => {
  const sections: PreparationValues = {
    title: { title: values.title },
    purpose: { purpose: values.purpose },
    meetingDate: { meetingDate: values.meetingDate },
    criteria: { criteria: values.criteria },
    budget: { amount: values.amount, reason },
    manager: { userId: values.userId },
  };

  return sections[section];
};

export const preparationDraft = <S extends PreparationSection>(
  section: S,
  round: RoundView,
  revision: number,
): PreparationSectionDraft<S> => {
  const values: PreparationSnapshot = {
    title: round.title,
    purpose: round.purpose,
    meetingDate: round.meetingDate ?? "",
    criteria: round.criteria.map((criterion) => ({
      key: criterion.id,
      id: criterion.id,
      title: criterion.title,
      description: criterion.description ?? "",
    })),
    amount: round.budget === null ? "" : toDecimal(round.budget),
    userId: round.managerUserId ?? "",
  };

  const value = structuredClone(sectionValue(section, values));
  return { section, revision, baseline: values, value };
};

const sectionFields: Record<PreparationSection, PreparationField[]> = {
  title: ["title"],
  purpose: ["purpose"],
  meetingDate: ["meetingDate"],
  criteria: ["criteria"],
  budget: ["amount"],
  manager: ["userId"],
};

const comparable = (values: PreparationSnapshot, field: PreparationField) => {
  if (field === "criteria") {
    return JSON.stringify(
      values.criteria.map(({ id, title, description }) => ({
        id,
        title: title.trim(),
        description: description.trim(),
      })),
    );
  }
  if (field === "amount") {
    const amount = parseMoneyInput(values.amount);
    return amount ? toDecimal(amount) : values.amount.trim();
  }

  return values[field].trim();
};

export const hasPreparationChanges = (draft: PreparationDraft) =>
  sectionFields[draft.section].some(
    (field) =>
      comparable({ ...draft.baseline, ...draft.value }, field) !==
      comparable(draft.baseline, field),
  );

export const hasPreparationDraft = (draft: PreparationDraft) =>
  hasPreparationChanges(draft) ||
  (draft.section === "budget" && Boolean(draft.value.reason.trim()));

// Only actual collisions need a choice. Untouched fields always follow the latest
// saved value; ordered criteria remain one deliberate conflict choice.
export const reconcilePreparation = <D extends PreparationDraft>(
  draft: D,
  round: RoundView,
  revision: number,
  choices: Partial<Record<PreparationField, "mine" | "saved">> = {},
) => {
  const latest = preparationDraft(draft.section, round, revision);
  const merged = { ...latest, value: { ...draft.value } } as PreparationDraft;
  const conflicts: PreparationField[] = [];
  for (const field of sectionFields[draft.section]) {
    const mine = comparable({ ...draft.baseline, ...draft.value }, field);
    const before = comparable(draft.baseline, field);
    const saved = comparable(latest.baseline, field);
    if (mine === before || mine === saved) {
      Object.assign(merged.value, { [field]: latest.baseline[field] });
    } else if (saved !== before) {
      conflicts.push(field);
      if (choices[field] === "saved") {
        Object.assign(merged.value, { [field]: latest.baseline[field] });
      }
    }
  }

  if (
    draft.section === "budget" &&
    comparable(latest.baseline, "amount") !== comparable(draft.baseline, "amount") &&
    comparable({ ...merged.baseline, ...merged.value }, "amount") ===
      comparable(latest.baseline, "amount")
  ) {
    if (merged.section === "budget") {
      merged.value.reason = "";
    }
  }

  return {
    latest: latest as Extract<PreparationDraft, { section: D["section"] }>,
    merged: merged as Extract<PreparationDraft, { section: D["section"] }>,
    conflicts,
    resolved: conflicts.every((field) => choices[field] !== undefined),
  };
};

export const draftChange = (draft: PreparationDraft): RoundChange => {
  switch (draft.section) {
    case "title":
    case "purpose":
      return { section: "details", ...draft.value };
    case "meetingDate":
      return { section: "details", meetingDate: draft.value.meetingDate || null };
    case "criteria":
      return {
        section: "criteria",
        criteria: draft.value.criteria.map(({ id, title, description }) => ({
          id: id!,
          title,
          description,
        })),
      };
    case "budget": {
      const amount = parseMoneyInput(draft.value.amount);
      return {
        section: "budget",
        amount: amount ? toDecimal(amount) : draft.value.amount.trim(),
        reason: draft.value.reason,
      };
    }
    case "manager":
      return { section: "manager", userId: draft.value.userId };
  }
};
