import { z } from "zod";

import { contactCommands } from "@merit/contacts/api";

const contactDetails = contactCommands.create.shape.details;
export const contactSchema = contactDetails.extend({
  contactId: z.uuid(),
  archived: z.boolean(),
  contactRevision: z.number().int().nonnegative(),
});
export const contactReadErrorSchema = z.object({ status: z.literal("not_found") });
export const contactWriteErrorSchema = z.union([
  z.object({ status: z.enum(["not_found", "conflict"]) }),
  z.object({ status: z.literal("invalid"), error: z.literal("invalid_contact") }),
  z.object({
    status: z.literal("invalid"),
    error: z.literal("outstanding_requests"),
    outstanding: z.array(z.object({ applicationId: z.string(), title: z.string() })),
  }),
]);
