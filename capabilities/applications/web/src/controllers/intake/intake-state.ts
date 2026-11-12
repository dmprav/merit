import type { z } from "zod";

import {
  canEditIntakeContent,
  canStartIntakeRevision,
  canDeleteApplication,
  intakeContent,
  intakeContentSchema,
  type IntakeChange,
  type WorkingRevision,
} from "@merit/applications/domain";
import type { ApplicationView as Application } from "@merit/grantmaking/api";

import type { IntakeFailure } from "../../contracts/intake";
import type { intakeStorage } from "./storage";

export type IntakeDraft = z.infer<typeof intakeStorage>;

export type IntakeSnapshot = IntakeDraft["baseline"];

export type IntakeValues = {
  [S in IntakeDraft["section"]]: Extract<IntakeDraft, { section: S }>["value"];
};

export type IntakeSection = Exclude<IntakeDraft["section"], "reason">;

export type SectionDraft<S extends keyof IntakeValues> = Omit<IntakeDraft, "section" | "value"> & {
  section: S;
  value: IntakeValues[S];
};

export const intakeSnapshot = (
  application: Application,
  working: WorkingRevision | null,
): IntakeSnapshot => ({
  content: working?.content ?? intakeContent(application),
  reason: working?.reason ?? "",
  contactId: application.contactId ?? null,
  summary: application.summary,
});

export const sectionValues = <S extends keyof IntakeValues>(
  section: S,
  snapshot: IntakeSnapshot,
): IntakeValues[S] => {
  const values: IntakeValues = {
    title: { title: snapshot.content.title },
    metadata: {
      applicant: snapshot.content.applicant,
      requested: snapshot.content.requested,
      projectPeriod: snapshot.content.projectPeriod ?? "",
      contactId: snapshot.contactId,
    },
    content: { answers: snapshot.content.answers },
    details: { summary: snapshot.summary },
    reason: { reason: snapshot.reason },
  };

  return values[section];
};

export const newIntakeDraft = <S extends keyof IntakeValues>(
  section: S,
  baseline: IntakeSnapshot,
  revision: number,
): SectionDraft<S> => ({
  section,
  baseline,
  revision,
  value: structuredClone(sectionValues(section, baseline)),
});

export const intakeDraftChanged = (draft: IntakeDraft | undefined) =>
  Boolean(
    draft &&
    JSON.stringify(draft.value) !== JSON.stringify(sectionValues(draft.section, draft.baseline)),
  );

// Reconcile only this section. Ordered submission answers remain one indivisible field.
export const reconcileIntake = <S extends keyof IntakeValues>(
  draft: SectionDraft<S>,
  latest: IntakeSnapshot,
  revision: number,
): SectionDraft<S> => {
  const before = sectionValues(draft.section, draft.baseline);
  const value = { ...sectionValues(draft.section, latest) };
  for (const key of Object.keys(value) as (keyof IntakeValues[S])[]) {
    if (JSON.stringify(draft.value[key]) !== JSON.stringify(before[key])) {
      value[key] = draft.value[key];
    }
  }

  return { ...draft, baseline: latest, revision, value };
};

export const intakeChange = (
  draft: Exclude<IntakeDraft, SectionDraft<"reason">>,
  working: WorkingRevision | null,
  reason: string,
): IntakeChange => {
  if (draft.section === "details") {
    return { action: "details", summary: draft.value.summary };
  }

  const content =
    draft.section === "metadata"
      ? {
          applicant: draft.value.applicant,
          requested: draft.value.requested,
          ...(draft.value.projectPeriod !== (draft.baseline.content.projectPeriod ?? "")
            ? { projectPeriod: draft.value.projectPeriod }
            : {}),
        }
      : draft.section === "content"
        ? intakeContentSchema.pick({ answers: true }).parse(draft.value)
        : draft.value;
  const contact =
    draft.section === "metadata" && draft.value.contactId !== undefined
      ? { contactId: draft.value.contactId }
      : {};

  return working
    ? { action: "save_revision", draft: { kind: working.kind, content, reason }, ...contact }
    : { action: "save_content", content, ...contact };
};

export const intakeDraftConflict = (
  draft: IntakeDraft | undefined,
  reasonDraft: IntakeDraft | undefined,
  revision: number,
) =>
  Boolean(
    draft &&
    (draft.revision !== revision ||
      (draft.section !== "details" && reasonDraft && reasonDraft.revision !== revision)),
  );

export const intakeDraftCommand = (
  draft: IntakeDraft,
  application: Pick<Application, "intakeStatus">,
  working: WorkingRevision | null,
  revision: number,
  reasonDraft: IntakeDraft | undefined,
  reason: string,
): { status: "ok"; change: IntakeChange; revision: number } | IntakeFailure => {
  if (draft.section === "reason") {
    return { status: "invalid", error: "invalid_application" };
  }
  if (draft.section !== "details" && !canEditIntakeContent(application, working)) {
    return { status: "invalid", error: "revision_unavailable" };
  }
  if (intakeDraftConflict(draft, reasonDraft, revision)) {
    return { status: "conflict" };
  }
  return { status: "ok", change: intakeChange(draft, working, reason), revision: draft.revision };
};

export const intakeRenameCommand = (
  application: Pick<Application, "intakeStatus">,
  working: WorkingRevision | null,
  title: string,
): IntakeChange | null => {
  if (application.intakeStatus === "in_preparation") {
    return { action: "save_content", content: { title } };
  }
  return canStartIntakeRevision(application, working)
    ? { action: "start_revision", kind: "correction" }
    : null;
};

export const intakeMenuActions = (
  application: Pick<Application, "intakeStatus" | "managerRecommendation" | "reviews">,
  working: WorkingRevision | null,
  hasTitleDraft: boolean,
) => [
  ...(canStartIntakeRevision(application, working)
    ? ["start_revision" as const]
    : hasTitleDraft
      ? ["title" as const]
      : []),
  ...(working
    ? ["discard_revision" as const]
    : canStartIntakeRevision(application, working)
      ? ["correct" as const]
      : []),
  ...(canDeleteApplication(application, {
    hasReviews: Boolean(
      application.reviews.requests.length || application.reviews.assessments.length,
    ),
    hasRecommendation: application.managerRecommendation !== null,
  })
    ? ["delete" as const]
    : []),
];
