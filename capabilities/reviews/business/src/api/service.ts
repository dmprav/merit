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

import type { SaveReviewRequest, ReviewSaveError } from "./commands/reviews";

export interface ReviewService {
  saveReview: (actor: Actor, input: SaveReviewRequest) => Promise<Saved<ReviewSaveError>>;
}
