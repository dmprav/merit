import { sql, type SQL } from "drizzle-orm";

import { currentIntakeApplication } from "@merit/applications/scope";
import { currentRecommendation } from "@merit/recommendations/scope";
import { currentReviews } from "@merit/reviews/scope";

export const moneyData = (minorUnits: SQL) =>
  sql<unknown>`case when ${minorUnits} is null then null else jsonb_build_object('minorUnits', (${minorUnits})::text, 'currency', 'EUR') end`;

export const currentApplicationRecord = sql<unknown>`${currentIntakeApplication} || jsonb_build_object('reviews', ${currentReviews}, 'managerRecommendation', ${currentRecommendation})`;
