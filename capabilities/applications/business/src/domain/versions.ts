import { z } from "zod";

export const materialVersionSchema = z.number().int().positive().brand<"MaterialVersion">();

export type MaterialVersion = z.infer<typeof materialVersionSchema>;
