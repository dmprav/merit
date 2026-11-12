import { z } from "zod";

const text = z.string();
const revision = z.number().int().nonnegative();
const intake = z.object({
  content: z.object({
    title: text,
    applicant: text,
    requested: text,
    projectPeriod: text.optional(),
    answers: z.array(z.object({ questionId: z.uuid(), question: text, response: text })),
  }),
  reason: text,
  contactId: text.nullable().optional(),
  summary: text,
});

const sectionDraft = <S extends string, V extends z.ZodType>(section: S, value: V) =>
  z.object({ section: z.literal(section), revision, baseline: intake, value });

export const intakeStorage = z.discriminatedUnion("section", [
  sectionDraft("title", z.object({ title: text })),
  sectionDraft(
    "metadata",
    z.object({
      applicant: text,
      requested: text,
      projectPeriod: text,
      contactId: text.nullable().optional(),
    }),
  ),
  sectionDraft("content", z.object({ answers: intake.shape.content.shape.answers })),
  sectionDraft("details", z.object({ summary: text })),
  sectionDraft("reason", z.object({ reason: text })),
]);
