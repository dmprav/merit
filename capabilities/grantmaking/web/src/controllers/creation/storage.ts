import { z } from "zod";

import { intakeContentSchema } from "@merit/applications/domain";

const text = z.string();
export const creationStorage = z.object({
  pdfs: intakeContentSchema.shape.pdfs,
  requestId: text,
  title: text,
  body: text,
  amount: text,
  meetingDate: text,
  applicant: text,
});
