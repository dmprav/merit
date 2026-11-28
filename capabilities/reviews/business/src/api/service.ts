import type { Actor } from "@merit/auth";

import type { ReviewRevision } from "../domain/versions";

type NotFound = { status: "not_found" };

type Conflict = { status: "conflict" };

type Invalid<Error extends string> = { status: "invalid"; error: Error };

type Saved<Error extends string> =
  | { status: "ok"; revision: ReviewRevision }
  | NotFound
  | Conflict
  | Invalid<Error>;

import type {
  AiReviewReadResult,
  AiReviewRequest,
  AiReviewRunLookup,
  AiReviewRunLookupResult,
  AiReviewRunRequest,
  AiReviewRunResult,
} from "./commands/ai-reviews";
import type { SaveReviewRequest, ReviewSaveError } from "./commands/reviews";

export interface ReviewService {
  saveReview: (actor: Actor, input: SaveReviewRequest) => Promise<Saved<ReviewSaveError>>;
  /** Ask the configured provider for an AI review and save it. Program managers only. */
  runAiReview: (actor: Actor, input: AiReviewRunRequest) => Promise<AiReviewRunResult>;
  /** The review a run already saved, without running anything. Program managers only. */
  readAiReviewRun: (actor: Actor, input: AiReviewRunLookup) => Promise<AiReviewRunLookupResult>;
  /** Every saved AI review of one application, newest first. Program managers only. */
  readAiReviews: (actor: Actor, input: AiReviewRequest) => Promise<AiReviewReadResult>;
  /** The provider and model a run would use, or null when this server has none. */
  aiReviewProvider: { provider: string; model: string } | null;
}
