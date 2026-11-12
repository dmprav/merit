import { z } from "zod";

const text = z.string();
const revision = z.number().int().nonnegative();
const values = z.object({
  title: text,
  purpose: text,
  meetingDate: text,
  criteria: z.array(z.object({ key: text, id: z.uuid(), title: text, description: text })),
  amount: text,
  userId: text,
});

const preparationSection = <S extends string, V extends z.ZodType>(section: S, value: V) =>
  z.object({ section: z.literal(section), revision, baseline: values, value });

export const preparationStorage = z.discriminatedUnion("section", [
  preparationSection("title", values.pick({ title: true })),
  preparationSection("purpose", values.pick({ purpose: true })),
  preparationSection("meetingDate", values.pick({ meetingDate: true })),
  preparationSection("criteria", values.pick({ criteria: true })),
  preparationSection("budget", values.pick({ amount: true }).extend({ reason: text })),
  preparationSection("manager", values.pick({ userId: true })),
]);
