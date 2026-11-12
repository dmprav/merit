import { z } from "zod";

const text = z.string();
export const creationStorage = z.object({
  requestId: text,
  title: text,
  body: text,
  amount: text,
  meetingDate: text,
  applicant: text,
});
