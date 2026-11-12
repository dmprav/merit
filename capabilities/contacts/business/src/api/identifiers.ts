import { z } from "zod";

import { workspaceSlugSchema } from "@merit/organizations/api";

export const contactAddress = { workspaceSlug: workspaceSlugSchema, contactId: z.uuid() };
