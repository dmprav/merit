import { recommendationsMessages } from "@merit/recommendations-web/message-content";

import { reviewStatusMessages } from "./views/reviews/status.messages";

export const en = {
  reviews: reviewStatusMessages,
  position: recommendationsMessages.position,
  workspace: {
    allReviews: "Manage reviews",
    noPosition: "No position recorded",
    earlierBasis: "Earlier submission v{{version}}",
    reviewedBasis: "Reviewed v{{version}}",
    requestedBasis: "Requested v{{version}}",
  },
  assessments: {
    shortTitle: "Review",
    none: "No reviewers assigned.",
  },
} as const;
