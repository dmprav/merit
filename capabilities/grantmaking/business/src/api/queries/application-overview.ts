import { z } from "zod";

import { recommendationSchema } from "@merit/recommendations/domain";

import { applicationRecordSchema } from "../../domain/model";
import { publicIdSchema } from "../identifiers";

export const applicationOverviewSchema = z.object({
  id: publicIdSchema,
  title: z.string(),
  applicant: z.string().nullable(),
  roundId: publicIdSchema,
  roundTitle: z.string(),
  intakeStatus: applicationRecordSchema.shape.intakeStatus,
  reviews: z.object({
    current: z.number().int().nonnegative(),
    outdated: z.number().int().nonnegative(),
    outstanding: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  criteriaChanged: z.boolean(),
  recommendation: z
    .object({ position: recommendationSchema.shape.position, outdated: z.boolean() })
    .nullable(),
});

export type ApplicationOverview = z.infer<typeof applicationOverviewSchema>;
