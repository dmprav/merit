import { z } from "zod";

import { isNegative, parseMoney, toDecimal } from "@merit/money";

import type { IntakeApplication, ApplicationUsage } from "./model";
import { materialVersionSchema } from "./versions";

export const intakeLimits = {
  titleLength: 200,
  applicantLength: 300,
  projectPeriodLength: 300,
  amountLength: 32,
  questionLength: 300,
  responseLength: 30000,
  answersCount: 100,
  reasonLength: 2000,
  summaryLength: 10000,
} as const;

export const intakeDetailsSchema = z.strictObject({
  summary: z.string().trim().max(intakeLimits.summaryLength),
});

export const intakeContentSchema = z.strictObject({
  title: z.string().trim().min(1).max(intakeLimits.titleLength),
  applicant: z.string().trim().max(intakeLimits.applicantLength),
  projectPeriod: z.string().trim().max(intakeLimits.projectPeriodLength).optional(),
  requested: z
    .string()
    .trim()
    .max(intakeLimits.amountLength)
    .refine(
      (value) => {
        if (!value) {
          return true;
        }
        const parsed = parseMoney(value);
        return parsed.ok && !isNegative(parsed.value);
      },
      { params: { reason: "invalid_requested_amount" } },
    )
    .transform((value) => {
      const parsed = value ? parseMoney(value) : null;
      return parsed?.ok ? toDecimal(parsed.value) : value;
    }),
  answers: z
    .array(
      z.strictObject({
        questionId: z
          .uuid()
          .describe(
            "Preserve this question ID across edits and reordering. Generate a new UUID only for a new section.",
          ),
        question: z.string().trim().max(intakeLimits.questionLength),
        response: z.string().trim().max(intakeLimits.responseLength),
      }),
    )
    .max(intakeLimits.answersCount)
    .refine((answers) => {
      const ids = answers.map((answer) => answer.questionId);
      return new Set(ids).size === ids.length;
    }, "Question IDs must be unique."),
});

export type IntakeContent = z.infer<typeof intakeContentSchema>;

export const workingRevisionSchema = z.strictObject({
  kind: z.enum(["correction", "revision"]),
  reason: z.string().trim().max(intakeLimits.reasonLength),
  content: intakeContentSchema,
});

export type WorkingRevision = z.infer<typeof workingRevisionSchema>;

const intakeContentChangeSchema = intakeContentSchema
  .partial()
  .refine(
    (change) => Object.values(change).some((value) => value !== undefined),
    "Choose an intake field to change.",
  );

const mergeIntakeContent = (
  content: IntakeContent,
  change: Partial<IntakeContent>,
): IntakeContent =>
  intakeContentSchema.parse({
    ...content,
    ...Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)),
  });

const sameIntakeContent = (left: IntakeContent, right: IntakeContent) =>
  JSON.stringify(intakeContentSchema.parse(left)) ===
  JSON.stringify(intakeContentSchema.parse(right));

export const intakeChanges = {
  saveContent: z.strictObject({
    action: z.literal("save_content"),
    content: intakeContentChangeSchema,
    contactId: z.uuid().nullable().optional(),
  }),
  startRevision: z.strictObject({
    action: z.literal("start_revision"),
    kind: z.enum(["correction", "revision"]),
  }),
  saveRevision: z.strictObject({
    action: z.literal("save_revision"),
    draft: workingRevisionSchema.extend({ content: intakeContentChangeSchema }),
    contactId: z.uuid().nullable().optional(),
  }),
  publishRevision: z.strictObject({ action: z.literal("publish_revision") }),
  discardRevision: z.strictObject({ action: z.literal("discard_revision") }),
  markReady: z.strictObject({ action: z.literal("mark_ready") }),
  delete: z.strictObject({ action: z.literal("delete") }),
  details: intakeDetailsSchema.extend({ action: z.literal("details") }),
};

export const intakeChangeSchema = z.discriminatedUnion("action", [
  intakeChanges.saveContent,
  intakeChanges.startRevision,
  intakeChanges.saveRevision,
  intakeChanges.publishRevision,
  intakeChanges.discardRevision,
  intakeChanges.markReady,
  intakeChanges.delete,
  intakeChanges.details,
]);

export type IntakeChange = z.infer<typeof intakeChangeSchema>;

export type IntakeChangeError =
  | "revision_required"
  | "incomplete_application"
  | "revision_unavailable"
  | "reason_required"
  | "unchanged_revision"
  | "application_in_use";

export const intakeContent = (
  application: Pick<IntakeApplication, "title" | "submission" | "requested">,
): IntakeContent => ({
  title: application.title,
  applicant: application.submission?.organization ?? "",
  requested: application.requested === null ? "" : toDecimal(application.requested),
  ...(application.submission?.projectPeriod !== undefined
    ? { projectPeriod: application.submission.projectPeriod }
    : {}),
  answers: application.submission?.answers ?? [],
});

export const missingIntakeFields = (content: IntakeContent) => {
  const missing: ("title" | "applicant" | "requested" | "answers")[] = [];
  if (!content.title.trim()) {
    missing.push("title");
  }
  if (!content.applicant.trim()) {
    missing.push("applicant");
  }
  if (!content.requested.trim()) {
    missing.push("requested");
  }
  if (
    !content.answers.length ||
    content.answers.some((answer) => !answer.question.trim() || !answer.response.trim())
  ) {
    missing.push("answers");
  }

  return missing;
};

export const canDeleteApplication = (
  application: Pick<IntakeApplication, "intakeStatus">,
  usage: ApplicationUsage,
) => application.intakeStatus === "in_preparation" && !usage.hasRecommendation && !usage.hasReviews;

export const canStartIntakeRevision = (
  application: Pick<IntakeApplication, "intakeStatus">,
  working: WorkingRevision | null,
) => application.intakeStatus !== "in_preparation" && working === null;

export const canEditIntakeContent = (
  application: Pick<IntakeApplication, "intakeStatus">,
  working: WorkingRevision | null,
) => application.intakeStatus === "in_preparation" || working !== null;

const withNewMaterialVersion = (
  application: IntakeApplication,
  content: IntakeContent,
): IntakeApplication => {
  const parsed = content.requested ? parseMoney(content.requested) : null;
  const version = materialVersionSchema.parse(application.version + 1);

  return {
    ...application,
    title: content.title,
    version,
    requested: parsed?.ok ? parsed.value : null,
    submission: {
      ...application.submission,
      version,
      organization: content.applicant,
      ...(content.projectPeriod !== undefined ? { projectPeriod: content.projectPeriod } : {}),
      answers: content.answers,
    },
  };
};

const revisionPublicationProblem = (
  application: IntakeApplication,
  workingRevision: WorkingRevision,
) => {
  if (!workingRevision.reason) {
    return "reason_required";
  }
  if (missingIntakeFields(workingRevision.content).length) {
    return "incomplete_application";
  }
  if (
    sameIntakeContent(intakeContent(application), {
      ...intakeContent(application),
      ...workingRevision.content,
    })
  ) {
    return "unchanged_revision";
  }
  return null;
};

const invalidIntakeChange = (error: IntakeChangeError) => ({ ok: false, error }) as const;

const prepareContentSave = (
  application: IntakeApplication,
  workingRevision: WorkingRevision | null,
  change: Partial<IntakeContent>,
) => {
  if (application.intakeStatus !== "in_preparation") {
    return invalidIntakeChange("revision_required");
  }

  const currentContent = intakeContent(application);
  const content = mergeIntakeContent(currentContent, change);

  return {
    ok: true,
    application: sameIntakeContent(currentContent, content)
      ? application
      : withNewMaterialVersion(application, content),
    workingRevision,
    action: "save_content",
    reason: null,
  } as const;
};

const prepareRevisionPublication = (
  application: IntakeApplication,
  workingRevision: WorkingRevision | null,
) => {
  if (!workingRevision) {
    return invalidIntakeChange("revision_unavailable");
  }
  const problem = revisionPublicationProblem(application, workingRevision);
  if (problem) {
    return invalidIntakeChange(problem);
  }

  const { kind: historyAction, reason, content } = workingRevision;

  return {
    ok: true,
    application: withNewMaterialVersion(application, content),
    workingRevision: null,
    action: historyAction,
    reason,
  } as const;
};

export const prepareIntakeChange = (
  application: IntakeApplication,
  workingRevision: WorkingRevision | null,
  change: IntakeChange,
  author: { userId: string; name: string; recordedAt: string },
  usage: ApplicationUsage,
) => {
  const unchanged = {
    ok: true,
    application,
    workingRevision,
    reason: null,
  } as const;

  switch (change.action) {
    case "save_content":
      return prepareContentSave(application, workingRevision, change.content);

    case "mark_ready":
      if (missingIntakeFields(intakeContent(application)).length) {
        return invalidIntakeChange("incomplete_application");
      }

      return {
        ...unchanged,
        action: change.action,
        application: { ...application, intakeStatus: "ready" },
      } as const;

    case "start_revision":
      if (!canStartIntakeRevision(application, workingRevision)) {
        return invalidIntakeChange("revision_unavailable");
      }

      return {
        ...unchanged,
        action: change.action,
        workingRevision: { kind: change.kind, reason: "", content: intakeContent(application) },
      };

    case "save_revision":
      if (!workingRevision || workingRevision.kind !== change.draft.kind) {
        return invalidIntakeChange("revision_unavailable");
      }

      return {
        ...unchanged,
        action: change.action,
        workingRevision: {
          ...change.draft,
          content: mergeIntakeContent(workingRevision.content, change.draft.content),
        },
      };

    case "publish_revision":
      return prepareRevisionPublication(application, workingRevision);

    case "discard_revision":
      return { ...unchanged, action: change.action, workingRevision: null };

    case "delete":
      if (!canDeleteApplication(application, usage)) {
        return invalidIntakeChange("application_in_use");
      }
      return { ...unchanged, action: change.action };

    case "details":
      return {
        ...unchanged,
        action: change.action,
        application: {
          ...application,
          summary: change.summary,
          summaryAuthor:
            change.summary === application.summary ? application.summaryAuthor : author,
        },
      };
  }
};
