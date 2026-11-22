import type { z } from "zod";

import { toDecimal } from "@merit/money";
import { parseMoneyInput } from "@merit/money/input";
import type { FundingRound, RoundChange } from "@merit/rounds/domain";

import type { preparationStorage } from "./storage";

type EditableRound = Pick<
  FundingRound,
  "title" | "purpose" | "meetingDate" | "criteria" | "budget" | "managerUserId"
>;

export type PreparationDraft = z.infer<typeof preparationStorage>;

export type PreparationSection = PreparationDraft["section"];

type PreparationSnapshot = PreparationDraft["baseline"];

type PreparationField = keyof PreparationSnapshot;

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
  round: EditableRound,
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

export const buildPreparationDraft = (
  section: PreparationSection,
  round: EditableRound,
  revision: number,
): PreparationDraft => {
  switch (section) {
    case "title":
      return preparationDraft("title", round, revision);
    case "purpose":
      return preparationDraft("purpose", round, revision);
    case "meetingDate":
      return preparationDraft("meetingDate", round, revision);
    case "criteria":
      return preparationDraft("criteria", round, revision);
    case "budget":
      return preparationDraft("budget", round, revision);
    case "manager":
      return preparationDraft("manager", round, revision);
  }
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

export const hasPreparationSectionConflict = (draft: PreparationDraft, round: EditableRound) => {
  const latest = preparationDraft(draft.section, round, draft.revision);
  return sectionFields[draft.section].some((field) => {
    const before = comparable(draft.baseline, field);
    const saved = comparable(latest.baseline, field);
    const mine = comparable({ ...draft.baseline, ...draft.value }, field);
    return saved !== before && mine !== before && mine !== saved;
  });
};

export const rebasePreparationDraft = <D extends PreparationDraft>(
  draft: D,
  round: EditableRound,
  revision: number,
): D => {
  const latest = preparationDraft(draft.section, round, revision);
  return { ...draft, revision, baseline: latest.baseline };
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
          id,
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
