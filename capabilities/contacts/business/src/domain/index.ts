import { z } from "zod";

export const contactDetailsSchema = z
  .strictObject({
    name: z.string().trim().max(200),
    email: z.union([z.literal(""), z.email().max(320)]),
    affiliation: z.string().trim().max(200),
  })
  .refine((value) => Boolean(value.name || value.email), {
    params: { reason: "name_or_email_required" },
  });

export type ContactDetails = z.infer<typeof contactDetailsSchema>;
