import type { IntakeApplication } from "@merit/applications/domain";
import type {
  DecisionUpdateError,
  EncodedDecisionResult,
  RecordDecisionRequest,
} from "@merit/decisions/api";
import type {
  decodeCommitmentContext,
  DecisionOutcome,
  DecisionInput,
  DecisionVersion,
} from "@merit/decisions/domain";
import type { MoneyData } from "@merit/money";
import type { Recommendation } from "@merit/recommendations/domain";

export type DecisionApplication = Pick<
  IntakeApplication,
  "title" | "intakeStatus" | "withdrawal"
> & {
  managerRecommendation: Recommendation | null;
};

export type DecisionRound = ReturnType<typeof decodeCommitmentContext>;

export type DecisionBaseline = {
  /** The decision revision the person saw when the draft began; 0 before any decision. */
  expectedRevision: number;
};

export type DecisionBudgetFailure = {
  budget: MoneyData | null;
  committed: MoneyData;
  excess: MoneyData | null;
};

export type DecisionFailure =
  | { status: "invalid"; error: DecisionUpdateError; budget?: undefined; excess?: undefined }
  | ({
      status: "invalid";
      error: "budget_required" | "commitment_exceeds_budget";
    } & DecisionBudgetFailure)
  | { status: "conflict" | "not_found" | "signed_out" | "unavailable" };

export type DecisionData = {
  /** The saved decision revision; 0 before any decision is recorded. */
  revision: number;
  /** Every saved version, newest first. */
  versions: readonly DecisionVersion[];
  save: (
    value: DecisionInput,
    baseline: DecisionBaseline,
  ) => Promise<{ status: "ok"; recorded: boolean } | DecisionFailure>;
};

/** The editable fields as the person types them. */
export type DecisionDraft = {
  outcome: DecisionOutcome;
  amount: string;
  conditions: string;
  reason: string;
  decidedBy: string;
  decisionDate: string;
  changeExplanation: string;
};

export type DecisionSaveResponse = EncodedDecisionResult | DecisionFailure;

export type DecisionTransport = (input: RecordDecisionRequest) => Promise<DecisionSaveResponse>;

export type SaveDecision = (
  value: DecisionInput,
) => DecisionFailure | null | Promise<DecisionFailure | null>;
