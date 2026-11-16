import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
import { workspaceSlugSchema } from "@merit/organizations/api";

const workspace = z.strictObject({ workspaceSlug: workspaceSlugSchema });
export const selectContactRequestSchema = workspace.extend({
  publicId: publicIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  contactId: z.uuid().nullable(),
});

export type SelectContactRequest = z.infer<typeof selectContactRequestSchema>;
