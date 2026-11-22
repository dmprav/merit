import { defineWorkflow, manager, reviewFixture } from "../definition.ts";

export const paperReviewCases = defineWorkflow(
  "manager-reviews",
  manager,
  () => import("./paper-reviews.ts"),
  reviewFixture,
  {
    "review-overview": {
      prepare: (steps, f) => steps.reviewOverview(f),
      prompt:
        "Which River Gardens reviews are outstanding, and which assessments use older material?",
      setup: "An outstanding request for Priya and Jo’s assessment on superseded material.",
      tools: ["list_application_reviews"],
      outcome: "Identifies Priya and the stale basis for Jo’s assessment.",
    },
    "cancel-request": {
      prepare: (steps, f) => steps.cancelRequest(f),
      prompt: "Take Priya off the outstanding River Gardens review list. We never invited her.",
      setup: "One outstanding request and no invitation.",
      tools: ["cancel_review_request"],
      outcome: "Only Priya’s request is cancelled; history retained.",
    },
    "record-paper-review": {
      prepare: (steps, f) => steps.recordPaperReview(f),
      prompt:
        "Record Priya’s 9 November 2026 paper review of River Gardens. Fund €200.50 because shared meals benefit the neighbourhood. She didn’t specify the versions she reviewed.",
      setup: "Outstanding request for Priya.",
      tools: ["record_assessment"],
      outcome:
        "Request received; recorded date, reasoning and amount match. Evidence basis remains unknown.",
    },
    "correct-paper-review": {
      prepare: (steps, f) => steps.correctPaperReview(f),
      prompt:
        "I mistyped the amount in Priya’s paper assessment. Change €200.50 to €210.50 and record that it was a transcription error.",
      setup: "Original assessment retains reasoning and amount.",
      tools: ["correct_assessment"],
      outcome: "New version with corrected amount and note; original version retained.",
    },
  },
);
