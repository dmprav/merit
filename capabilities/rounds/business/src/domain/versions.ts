import { z } from "zod";

export const criteriaVersionSchema = z.number().int().positive().brand<"CriteriaVersion">();

export type CriteriaVersion = z.infer<typeof criteriaVersionSchema>;
