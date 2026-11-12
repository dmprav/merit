import { z } from "zod";

import { contactDetailsSchema } from "../domain/index";
import { contactAddress } from "./identifiers";
import type { ContactRecord } from "./records";

const existingContact = {
  ...contactAddress,
  expectedContactRevision: z.number().int().nonnegative(),
};
export const contactCommands = {
  create: z.strictObject({
    ...contactAddress,
    action: z.literal("create"),
    details: contactDetailsSchema,
  }),
  update: z.strictObject({
    ...existingContact,
    action: z.literal("update"),
    details: contactDetailsSchema,
  }),
  archive: z.strictObject({ ...existingContact, action: z.literal("archive") }),
  restore: z.strictObject({ ...existingContact, action: z.literal("restore") }),
};
export const contactCommandSchema = z.discriminatedUnion("action", [
  contactCommands.create,
  contactCommands.update,
  contactCommands.archive,
  contactCommands.restore,
]);

export type ContactCommand = z.infer<typeof contactCommandSchema>;

export type SaveContactResult =
  | { status: "ok"; contact: ContactRecord }
  | { status: "not_found" | "conflict" }
  | { status: "invalid"; error: "invalid_contact" }
  | {
      status: "invalid";
      error: "outstanding_requests";
      outstanding: { publicId: string; title: string }[];
    };
