import type { PageSource } from "@merit/query/contracts";
import type {
  ReviewerService,
  ReviewerResult,
  ReviewerPage,
  ReviewerSummary,
  ReviewerEvent,
} from "@merit/reviews/api";

export type ReviewerResponse<T> = ReviewerResult<T> | { status: "unavailable" | "signed_out" };

export type ReviewerData = {
  read: () => Promise<ReviewerResponse<ReviewerPage>>;
  respond: (
    input: Parameters<ReviewerService["respond"]>[1],
  ) => Promise<ReviewerResponse<ReviewerSummary>>;
  save: (
    input: Parameters<ReviewerService["saveDraft"]>[1],
  ) => Promise<ReviewerResponse<{ revision: number }>>;
  submit: (
    input: Parameters<ReviewerService["submit"]>[1],
  ) => Promise<ReviewerResponse<{ revision: number }>>;
};

export type ManagerReviewerData = {
  historySource?: (assignment: ReviewerSummary) => PageSource<ReviewerEvent>;
  read: () => Promise<ReviewerResponse<(ReviewerSummary & { history?: ReviewerEvent[] })[]>>;
  invite: (
    requestId: string,
    dueDate: string | null,
    commandId: string,
  ) => Promise<ReviewerResponse<ReviewerSummary>>;
  manage: (
    assignment: ReviewerSummary,
    action: Parameters<ReviewerService["manage"]>[1]["action"],
    note: string,
    commandId: string,
  ) => Promise<ReviewerResponse<ReviewerSummary>>;
  refresh: () => Promise<void>;
};
