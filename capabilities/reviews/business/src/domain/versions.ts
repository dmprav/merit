import { z } from "zod";

export const reviewRevisionSchema = z.number().int().nonnegative().brand<"ReviewRevision">();

export type ReviewRevision = z.infer<typeof reviewRevisionSchema>;
