import { sql } from "drizzle-orm";

import type { ApplicationReviewWork } from "@merit/applications/server/grant-work";

import { hasReviewActivity } from "../projections";
import { closeReviewsForWithdrawal } from "./withdrawal";

export const applicationReviewWork: ApplicationReviewWork = {
  hasActivity: async ({ tx, caseId }) => {
    const { rows } = await tx.execute<{ active: boolean }>(
      sql`select ${hasReviewActivity(caseId)} as active`,
    );
    return rows[0]?.active === true;
  },
  closeForWithdrawal: closeReviewsForWithdrawal,
};
