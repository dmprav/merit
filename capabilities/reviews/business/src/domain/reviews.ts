import { z } from "zod";

import { materialVersionSchema, type MaterialVersion } from "@merit/applications/domain";
import {
  reviewCriteriaSchema,
  criteriaVersionSchema,
  type CriteriaVersion,
} from "@merit/rounds/domain";

import { reviewRevisionSchema } from "./versions";

export { reviewCriteriaSchema } from "@merit/rounds/domain";

import { provenanceSchema } from "@merit/auth";
import { calendarDateSchema } from "@merit/dates";
import { isNegative, isZero, parseMoney } from "@merit/money";

export const assessmentInputSchema = z
  .strictObject({
    applicationVersion: materialVersionSchema.nullable(),
    criteriaVersion: criteriaVersionSchema.nullable(),
    date: calendarDateSchema.nullable(),
    position: z.enum(["Fund", "Fund with a condition", "Defer", "Decline"]).nullable(),
    amount: z
      .string()
      .max(32)
      .nullable()
      .refine((value) => {
        if (value === null) {
          return true;
        }
        const parsed = parseMoney(value);
        return parsed.ok && !isNegative(parsed.value);
      }, "Enter a nonnegative amount with at most two decimal places."),
    reasoning: z.string().trim().min(1).max(20000),
    observations: z
      .array(
        z.object({
          criterionId: z.uuid().nullable(),
          criterion: z.string().max(200),
          text: z.string().max(5000),
        }),
      )
      .max(100),
  })
  .refine(
    (value) => {
      if (value.position === null || value.amount === null) {
        return true;
      }

      const parsed = parseMoney(value.amount);
      return (
        parsed.ok &&
        (value.position === "Decline"
          ? isZero(parsed.value)
          : value.position === "Defer"
            ? isZero(parsed.value)
            : !isZero(parsed.value))
      );
    },
    { message: "Check the stated funding position and amount.", path: ["amount"] },
  );
const recorderSchema = z.object({
  userId: z.string(),
  name: z.string(),
  recordedAt: z.string(),
  provenance: provenanceSchema.optional(),
});
const assessmentVersionSchema = z.object({
  content: assessmentInputSchema,
  criteria: reviewCriteriaSchema.nullable(),
  recorder: recorderSchema.nullable(),
  note: z.string().max(2000),
});
export const reviewStateSchema = z.object({
  revision: reviewRevisionSchema,
  requests: z.array(
    z.object({
      id: z.string(),
      contactId: z.string(),
      reviewer: z.string(),
      applicationVersion: materialVersionSchema.nullable(),
      criteriaVersion: criteriaVersionSchema.nullable(),
      criteria: reviewCriteriaSchema.nullable(),
      status: z.enum(["outstanding", "received", "cancelled"]),
      recorder: recorderSchema.nullable(),
      closedBy: recorderSchema.nullable(),
    }),
  ),
  assessments: z.array(
    z.object({
      id: z.string(),
      contactId: z.string(),
      reviewer: z.string(),
      requestId: z.string().nullable(),
      previousId: z.string().nullable(),
      authorUserId: z.string().nullable().optional(),
      versions: z.array(assessmentVersionSchema).min(1),
    }),
  ),
});

export type ReviewState = z.infer<typeof reviewStateSchema>;

export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

export const emptyReviews = (): ReviewState => ({
  revision: reviewRevisionSchema.parse(0),
  requests: [],
  assessments: [],
});

export const reviewChanges = {
  request: z.strictObject({
    action: z.literal("request"),
    id: z.uuid(),
    contactId: z.uuid(),
    replacesId: z.string().nullable(),
  }),
  cancel: z.strictObject({ action: z.literal("cancel"), id: z.string() }),
  record: z.strictObject({
    action: z.literal("record"),
    id: z.uuid(),
    contactId: z.uuid(),
    requestId: z.string().nullable(),
    previousId: z.string().nullable(),
    content: assessmentInputSchema,
  }),
  edit: z.strictObject({
    action: z.literal("edit"),
    id: z.string(),
    content: assessmentInputSchema,
    note: z.string().trim().max(2000),
  }),
};

export const reviewChangeSchema = z.discriminatedUnion("action", [
  reviewChanges.request,
  reviewChanges.cancel,
  reviewChanges.record,
  reviewChanges.edit,
]);

export type ReviewChange = z.infer<typeof reviewChangeSchema>;

export type ReviewChangeError =
  | "request_unavailable"
  | "contact_unavailable"
  | "already_requested"
  | "version_unavailable"
  | "criteria_unavailable"
  | "assessment_unavailable"
  | "reviewer_authored"
  | "follow_up_required";

export const isEligibleReviewer = (contact: { name: string; archived: boolean }) =>
  !contact.archived && Boolean(contact.name.trim());

type ReviewChangeContext = {
  contact?: { id: string; name: string; archived: boolean };
  applicationVersion: MaterialVersion;
  availableVersions: MaterialVersion[];
  criteriaVersion: CriteriaVersion;
  criteriaHistory: { version: CriteriaVersion; criteria: z.infer<typeof reviewCriteriaSchema> }[];
  recorder: z.infer<typeof recorderSchema>;
};

type ReviewUpdate = { ok: true; changed: boolean } | { ok: false; error: ReviewChangeError };

const invalid = (error: ReviewChangeError) => ({ ok: false, error }) as const;

const requestReview = (
  state: ReviewState,
  change: Extract<ReviewChange, { action: "request" }>,
  context: ReviewChangeContext,
): ReviewUpdate => {
  const contact = context.contact;
  if (!contact || !isEligibleReviewer(contact)) {
    return invalid("contact_unavailable");
  }
  if (state.requests.some((value) => value.id === change.id)) {
    return { ok: true, changed: false } as const;
  }
  if (
    state.requests.some(
      (value) =>
        value.contactId === contact.id &&
        value.status === "outstanding" &&
        value.id !== change.replacesId,
    )
  ) {
    return invalid("already_requested");
  }

  if (change.replacesId) {
    const previous = state.requests.find((value) => value.id === change.replacesId);
    if (!previous || previous.status !== "outstanding") {
      return invalid("request_unavailable");
    }
    previous.status = "cancelled";
    previous.closedBy = context.recorder;
  }

  state.requests.push({
    id: change.id,
    contactId: contact.id,
    reviewer: contact.name,
    applicationVersion: context.applicationVersion,
    criteriaVersion: context.criteriaVersion,
    criteria: context.criteriaHistory.find((value) => value.version === context.criteriaVersion)!
      .criteria,
    status: "outstanding",
    recorder: context.recorder,
    closedBy: null,
  });
  return { ok: true, changed: true };
};

const editAssessment = (
  state: ReviewState,
  change: Extract<ReviewChange, { action: "edit" }>,
  version: z.infer<typeof assessmentVersionSchema>,
): ReviewUpdate => {
  const assessment = state.assessments.find((value) => value.id === change.id);
  if (!assessment) {
    return invalid("assessment_unavailable");
  }
  if (assessment.authorUserId) {
    return invalid("reviewer_authored");
  }

  const last = assessment.versions.at(-1)!;
  if (JSON.stringify(last.content) === JSON.stringify(version.content) && !change.note) {
    return { ok: true, changed: false } as const;
  }

  assessment.versions.push(version);
  return { ok: true, changed: true };
};

const recordAssessment = (
  state: ReviewState,
  change: Extract<ReviewChange, { action: "record" }>,
  context: ReviewChangeContext,
  version: z.infer<typeof assessmentVersionSchema>,
): ReviewUpdate => {
  const assessment = state.assessments.find((value) => value.id === change.id);
  const contact = context.contact;
  if (!contact || !isEligibleReviewer(contact)) {
    return invalid("contact_unavailable");
  }
  if (assessment) {
    return { ok: true, changed: false } as const;
  }

  const previous = state.assessments.find((value) => value.id === change.previousId);
  const latest = state.assessments.filter((value) => value.contactId === contact.id).at(-1);
  if (
    (latest?.id ?? null) !== change.previousId ||
    (previous && previous.contactId !== contact.id)
  ) {
    return invalid("follow_up_required");
  }

  if (change.requestId) {
    const linked = state.requests.find((value) => value.id === change.requestId);
    if (!linked || linked.contactId !== contact.id || linked.status !== "outstanding") {
      return invalid("request_unavailable");
    }
    linked.status = "received";
    linked.closedBy = context.recorder;
  }

  state.assessments.push({
    id: change.id,
    contactId: contact.id,
    reviewer: contact.name,
    requestId: change.requestId,
    previousId: change.previousId,
    versions: [version],
  });
  return { ok: true, changed: true };
};

const applyReviewChange = (
  state: ReviewState,
  change: ReviewChange,
  context: ReviewChangeContext,
): ReviewUpdate => {
  if (change.action === "cancel") {
    const request = state.requests.find((value) => value.id === change.id);
    if (!request || request.status !== "outstanding") {
      return invalid("request_unavailable");
    }
    request.status = "cancelled";
    request.closedBy = context.recorder;
    return { ok: true, changed: true };
  }
  if (change.action === "request") {
    return requestReview(state, change, context);
  }

  const content = change.content;
  if (
    content.applicationVersion !== null &&
    !context.availableVersions.includes(content.applicationVersion)
  ) {
    return invalid("version_unavailable");
  }

  const basis = context.criteriaHistory.find((value) => value.version === content.criteriaVersion);
  if (content.criteriaVersion !== null && !basis) {
    return invalid("criteria_unavailable");
  }

  const knownCriteria = new Set(
    context.criteriaHistory.flatMap((entry) => entry.criteria.map((criterion) => criterion.id)),
  );
  if (
    content.observations.some(
      (observation) => observation.criterionId && !knownCriteria.has(observation.criterionId),
    )
  ) {
    return invalid("criteria_unavailable");
  }

  const version = {
    content,
    criteria: basis?.criteria ?? null,
    recorder: context.recorder,
    note: change.action === "edit" ? change.note : "",
  };
  return change.action === "edit"
    ? editAssessment(state, change, version)
    : recordAssessment(state, change, context, version);
};

export const prepareReviewChange = (
  source: ReviewState,
  change: ReviewChange,
  context: ReviewChangeContext,
) => {
  const state = structuredClone(source);
  const result = applyReviewChange(state, change, context);
  if (!result.ok) {
    return result;
  }
  if (!result.changed) {
    return { ok: true, state: source } as const;
  }

  state.revision = reviewRevisionSchema.parse(state.revision + 1);
  return { ok: true, state } as const;
};
