import { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";
import { workspaceSlugSchema } from "@merit/organizations/api";
import {
  compareCriteriaContent,
  assessmentStatus,
  summarizeAssessments,
} from "@merit/reviews/domain";
import { fundingRoundSchema } from "@merit/rounds/domain";

import { applicationOverviewSchema } from "../../api/queries/application-overview";
import { readApplicationOverviews } from "../persistence/queries/application-overview";
import { readGrantWorkspaceAccess } from "../persistence/queries/reading";

const basesSchema = z.array(
  z.object({
    submission: z.object({ applicationVersion: materialVersionSchema.nullable() }).nullable(),
    criteria: fundingRoundSchema.shape.criteria.nullable(),
  }),
);

export const listWorkspaceApplications = (db: Database, actor: Actor, workspaceSlug: string) =>
  readTransaction(db, async (tx) => {
    const parsed = workspaceSlugSchema.safeParse(workspaceSlug);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const slug = parsed.data;
    const access = await readGrantWorkspaceAccess(tx, actor.userId, slug);
    if (!access) {
      return { status: "not_found" } as const;
    }
    if (!access.allowed) {
      return { status: "forbidden" } as const;
    }

    const rows = await readApplicationOverviews(tx, actor.userId, slug);
    const applications = rows.map((row) => {
      const version = materialVersionSchema.parse(row.version);
      const criteria = fundingRoundSchema.shape.criteria.parse(row.criteria);
      const bases = basesSchema.parse(row.reviewBases).map((review) => {
        const comparison = compareCriteriaContent(review.criteria, criteria);
        return {
          submission: review.submission,
          criteriaChanged: comparison === "different",
          criteriaUnknown: comparison === "unknown",
        };
      });
      return applicationOverviewSchema.parse({
        ...row,
        reviews: summarizeAssessments(
          bases.map((review) => ({ status: assessmentStatus(review, version) })),
        ),
        criteriaChanged: bases.some((review) => review.criteriaChanged),
      });
    });
    return { status: "ok", applications } as const;
  });
