import type { IntakeApplication } from "@merit/applications/domain";
import type {
  encodeRecommendationResult,
  SaveRecommendationRequest,
} from "@merit/recommendations/api";
import type {
  BudgetTotals,
  Recommendation,
  RecommendationUpdateError,
} from "@merit/recommendations/domain";
import type { FundingRound } from "@merit/rounds/domain";

export type RecommendationApplication = Pick<
  IntakeApplication,
  "title" | "version" | "requested" | "intakeStatus" | "withdrawal"
> & {
  managerRecommendation: Recommendation | null;
};

export type RecommendationRound = Pick<FundingRound, "budget" | "manager"> & {
  totals: Pick<BudgetTotals, "proposed" | "withdrawnApplications">;
};

export type RecommendationBaseline = {
  expectedRevision: number;
  expectedApplicationVersion: number;
};

export type RecommendationData = {
  revision: number;
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
  | ReturnType<typeof encodeRecommendationResult>
  | RecommendationFailure;

export type RecommendationTransport = (
  input: SaveRecommendationRequest,
) => Promise<RecommendationSaveResponse>;

export type SaveRecommendation = (
  value: Recommendation,
) => RecommendationFailure | null | Promise<RecommendationFailure | null>;
