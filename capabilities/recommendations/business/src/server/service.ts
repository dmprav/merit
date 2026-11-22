import type { Database } from "@merit/db";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";

type DatabaseAccess = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

import type { RecommendationsService } from "../api/service";
import { saveFundingRecommendation, type IsCurrentAssessment } from "./commands/recommendations";

export const createRecommendationsService = ({
  database,
  onSaved,
  isCurrentAssessment,
}: {
  database: DatabaseAccess;
  onSaved?: WorkspaceChangeObserver;
  isCurrentAssessment: IsCurrentAssessment;
}): RecommendationsService => ({
  saveRecommendation: (actor, input) =>
    database((db) => saveFundingRecommendation(db, actor, input, isCurrentAssessment, onSaved)),
});
