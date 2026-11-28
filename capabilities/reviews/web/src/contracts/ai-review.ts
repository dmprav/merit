import type { AiReviewRunResult } from "@merit/reviews/api";
import type { AiReviewAvailability, AiReviewEntry } from "@merit/reviews/domain";

export type AiReviewProvider = { provider: string; model: string };

/** A run that never reached a verdict: the transport failed or the session ended. */
export type AiReviewRunResponse = AiReviewRunResult | { status: "unavailable" | "signed_out" };

/** An application's saved AI reviews and the operations that add one. */
export type AiReviewData = {
  /** Newest first, each with its freshness. */
  reviews: readonly AiReviewEntry[];
  availability: AiReviewAvailability;
  /** The provider and model a new run would use; null when the server has none. */
  provider: AiReviewProvider | null;
  /** `runId` identifies one submission; sending it again returns the review it saved. */
  run: (runId: string) => Promise<AiReviewRunResponse>;
  refresh: () => Promise<void>;
};

export type AiReviewTransport = (runId: string) => Promise<AiReviewRunResponse>;
