import { reviewStatusMessages } from "./views/reviews/status.messages";

export const en = {
  collection: {
    close: "Close review details",
    inspect: "Review details for {{title}}",
    progress: "{{completed}} of {{total}} reviewed",
    round: "this round",
    none: "None assigned",
    criteriaExplanation:
      "The current criteria differ from the criteria used for at least one review or request. Inspect the review basis before relying on it.",
  },
  reviews: reviewStatusMessages,
  position: {
    decline: "Decline",
    decline_summary: "Recommends declining",
    fund: "Fund",
    fund_summary: "Recommends funding",
    fundWithCondition: "Fund with a condition",
    fundWithCondition_summary: "Recommends funding with a condition",
    defer: "Defer",
    defer_summary: "Recommends deferral",
  },
  outcome: {
    positionNotStated: "Funding position: Not stated",
    amountNotStated: "Proposed amount: Not stated",
    noAllocation: "No funding proposed",
    proposedAmount: "{{amount}} proposed",
  },
  workspace: {
    allReviews: "Manage reviews",
    noPosition: "No position recorded",
    earlierBasis: "Based on an earlier submission",
    reviewedBasis: "Reviewed v{{version}}",
    requestedBasis: "Requested v{{version}}",
  },
  assessments: {
    shortTitle: "Review",
    none: "No reviewers assigned.",
  },
} as const;
