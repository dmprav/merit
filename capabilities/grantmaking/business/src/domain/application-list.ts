import { z } from "zod";

import { workspaceSlugSchema } from "@merit/organizations/api";

import { applicationFilters } from "./application-filter";
import { publicIdSchema } from "./identifiers";

const applicationFilterSchema = z.strictObject({
  participation: z.enum(applicationFilters.participation).optional(),
  readiness: z.enum(applicationFilters.readiness).optional(),
  reviews: z.enum(applicationFilters.reviews).optional(),
  evidence: z.enum(applicationFilters.evidence).optional(),
  recommendation: z.enum(applicationFilters.recommendation).optional(),
});

export const workspaceApplicationsPageSize = 50;
export const workspaceApplicationsInput = z.object({
  workspaceSlug: workspaceSlugSchema,
  roundId: publicIdSchema.optional(),
  query: z.string().trim().max(500).default(""),
  filter: applicationFilterSchema.default({}),
  sort: z.enum(["application", "applicant", "round", "intake", "requested", "proposed"]).optional(),
  direction: z.enum(["ascending", "descending"]).default("ascending"),
  offset: z.number().int().nonnegative().max(100000000).default(0),
});

export type WorkspaceApplicationsInput = z.input<typeof workspaceApplicationsInput>;

export type WorkspaceApplicationsQuery = z.output<typeof workspaceApplicationsInput>;
