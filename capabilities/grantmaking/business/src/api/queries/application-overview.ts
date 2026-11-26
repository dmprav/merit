import { z } from "zod";

import { publicIdSchema } from "@merit/db/identifiers";
import { decisionOutcomes } from "@merit/decisions/domain";
import { moneyDataSchema } from "@merit/money";
import { recommendationSchema } from "@merit/recommendations/domain";

import { applicationRecordSchema } from "../../domain/model";

export { applicationFilters, type ApplicationFilter } from "../../domain/application-filter";

export const applicationOverviewSchema = z.object({
  id: publicIdSchema,
  title: z.string(),
  applicant: z.string().nullable(),
  roundId: publicIdSchema,
  roundTitle: z.string(),
  intakeStatus: applicationRecordSchema.shape.intakeStatus,
  withdrawn: z.boolean(),
  requested: moneyDataSchema.nullable(),
  reviews: z.object({
    current: z.number().int().nonnegative(),
    outdated: z.number().int().nonnegative(),
    outstanding: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  criteriaChanged: z.boolean(),
  recommendation: z
    .object({
      position: recommendationSchema.shape.position,
      outdated: z.boolean(),
      allocation: moneyDataSchema,
    })
    .nullable(),
  /** The committee's current decision, kept apart from the manager's recommendation. */
  decision: z.object({ outcome: z.enum(decisionOutcomes) }).nullable(),
});

export type ApplicationOverview = z.infer<typeof applicationOverviewSchema>;

export {
  workspaceApplicationsInput,
  workspaceApplicationsPageSize,
  type WorkspaceApplicationsInput,
  type WorkspaceApplicationsQuery,
} from "../../domain/application-list";

export type WorkspaceApplicationsPage = {
  applications: ApplicationOverview[];
  total: number;
  matching: number;
  offset: number;
};
