import { defineWorkflow, manager, reviewFixture } from "../definition.ts";

export const aiReviewCases = defineWorkflow(
  "ai-reviews",
  manager,
  () => import("./ai-reviews.ts"),
  reviewFixture,
  {
    "run-ai-review": {
      prepare: (steps, f) => steps.runAiReview(f),
      prompt: "Ask Merit AI to review River Gardens against the round’s criteria.",
      setup: "Workspace consent is on and River Gardens has no AI review.",
      tools: ["run_ai_review"],
      relatedTools: ["read_ai_reviews"],
      outcome:
        "One AI review of River Gardens is saved and reported as Merit AI’s view, not as an assessment.",
      replyCriterion:
        "Reports Merit AI’s funding position for River Gardens and presents it as an AI review rather than a reviewer’s assessment.",
    },
    "read-ai-reviews": {
      prepare: (steps, f) => steps.readAiReviews(f),
      prompt: "What did Merit AI conclude about River Gardens, and is that still current?",
      setup: "One saved AI review was made against the current material and criteria.",
      tools: ["read_ai_reviews"],
      outcome: "Reports the Fund with a condition position and that the review is current.",
    },
  },
);
