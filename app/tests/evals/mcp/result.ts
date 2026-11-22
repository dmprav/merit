import { z } from "zod";

const content = z.record(z.string(), z.unknown());
export const observedCall = z.object({
  source: z.enum(["merit", "mailbox"]),
  name: z.string(),
  arguments: content.optional(),
  outcome: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("pending") }),
    z.object({
      kind: z.literal("error"),
      content: content.optional(),
      message: z.string().optional(),
    }),
    z.object({ kind: z.literal("success"), content }),
  ]),
});

export const trialResult = z.object({
  id: z.string(),
  prompt: z.string(),
  replyCriterion: z.string(),
  observation: z.object({
    kind: z.literal("workflow"),
    trace: z.array(observedCall),
    recipients: z.array(z.string()),
    reply: z.string(),
  }),
  grade: z.object({
    selection: z.array(z.string()),
    effects: z.array(z.string()).nullable(),
    reply: z.discriminatedUnion("status", [
      z.object({ status: z.enum(["pending", "partial"]) }),
      z.object({ status: z.literal("passed") }),
      z.object({ status: z.literal("failed"), issue: z.string() }),
    ]),
  }),
});

export type TrialResult = z.infer<typeof trialResult>;

export const resultStatus = (grade: TrialResult["grade"]) =>
  grade.selection.length || grade.effects?.length || grade.reply.status === "failed"
    ? "flagged"
    : grade.reply.status === "pending" || grade.reply.status === "partial"
      ? "pending"
      : "passed";

export const invitationCalibration = trialResult.refine(
  ({ id, observation, grade }) =>
    id === "compose-invite" &&
    observation.trace.filter(
      (call) => call.name === "invite_reviewer" && call.outcome.kind === "success",
    ).length === 1 &&
    observation.recipients.length === 1 &&
    observation.recipients[0] === "priya@example.test" &&
    grade.selection.includes("Unexpected invite_reviewer") &&
    grade.effects?.some((issue) => issue.includes("Unexpected reviewer assignments")),
  "Expected the grader to flag both the unwanted invitation and its persisted effect",
);
