import type { encodeMoney } from "@merit/money";
import type { encodeRecommendation, SaveRecommendationRequest } from "@merit/recommendations/api";
import type { Recommendation, RecommendationUpdateError } from "@merit/recommendations/domain";

export type RecommendationBaseline = {
  expectedRevision: number;
  expectedApplicationVersion: number;
};

export type RecommendationData = {
  revision: number;
  disabled: boolean;
  save: (
    value: Recommendation,
    baseline: RecommendationBaseline,
  ) => Promise<
    | { status: "ok" }
    | { status: "unavailable" }
    | { status: "invalid"; error: RecommendationUpdateError }
    | { status: "conflict" | "not_found" | "signed_out" }
  >;
};

export type RecommendationDraft = {
  position: Recommendation["position"];
  amount: string;
  reasoning: string;
};

export type RecommendationFailure = Exclude<
  Awaited<ReturnType<RecommendationData["save"]>>,
  { status: "ok" }
>;

export type RecommendationSaveResponse =
  | {
      status: "ok";
      recommendation: ReturnType<typeof encodeRecommendation>;
      recommendationVersion: number;
      budget: ReturnType<typeof encodeMoney> | null;
      totals: {
        proposed: ReturnType<typeof encodeMoney>;
        remaining: ReturnType<typeof encodeMoney> | null;
        withdrawnApplications: number;
      };
    }
  | RecommendationFailure;

export type RecommendationTransport = (
  input: SaveRecommendationRequest,
) => Promise<RecommendationSaveResponse>;

export type SaveRecommendation = (
  value: Recommendation,
) => RecommendationFailure | null | Promise<RecommendationFailure | null>;
