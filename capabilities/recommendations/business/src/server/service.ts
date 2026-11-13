import type { Database } from "@merit/db";

type DatabaseAccess = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

import type { RecommendationsService } from "../api/service";
import { saveFundingRecommendation } from "./commands/recommendations";

export const createRecommendationsService = ({
  database,
}: {
  database: DatabaseAccess;
}): RecommendationsService => ({
  saveRecommendation: (actor, input) =>
    database((db) => saveFundingRecommendation(db, actor, input)),
});
