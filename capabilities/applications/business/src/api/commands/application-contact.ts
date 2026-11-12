import { z } from "zod";

import { workspaceSlugSchema } from "@merit/organizations/api";

const workspace = z.strictObject({ workspaceSlug: workspaceSlugSchema });
export const selectContactRequestSchema = workspace.extend({
  publicId: z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/),
  expectedRevision: z.number().int().nonnegative(),
  contactId: z.uuid().nullable(),
});

export type SelectContactRequest = z.infer<typeof selectContactRequestSchema>;
