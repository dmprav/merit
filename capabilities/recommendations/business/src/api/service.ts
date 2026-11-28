import type { Actor } from "@merit/auth";

type NotFound = { status: "not_found" };

type Conflict = { status: "conflict" };

type Invalid<Error extends string> = { status: "invalid"; error: Error };

import type { Money } from "@merit/money";

import type { BudgetTotals } from "../domain/budget";
import type { Recommendation, RecommendationUpdateError } from "../domain/recommendation";
import type { SaveRecommendationRequest } from "./commands";

export interface RecommendationsService {
  saveRecommendation: (
    actor: Actor,
    input: SaveRecommendationRequest,
  ) => Promise<
    | {
        status: "ok";
        recommendation: Recommendation;
        recommendationVersion: number;
        budget: Money | null;
        totals: BudgetTotals;
      }
    | NotFound
    | Conflict
    | Invalid<RecommendationUpdateError>
  >;
}
