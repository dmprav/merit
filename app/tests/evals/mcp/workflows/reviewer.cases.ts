import { defineWorkflow, reviewer, reviewFixture } from "../definition.ts";

export const reviewerCases = defineWorkflow(
  "reviewer",
  reviewer,
  () => import("./reviewer-scenarios.ts"),
  reviewFixture,
  {
    "my-assignments": {
      prepare: (steps, f) => steps.myAssignments(f),
      prompt: "Which of my grant reviews are waiting for me?",
      setup: "Reviewer has outstanding work and another reviewer has a separate assignment.",
      tools: ["list_my_reviews"],
      outcome: "Identifies only the acting reviewer’s work.",
    },
    "assigned-evidence": {
      prepare: (steps, f) => steps.assignedEvidence(f),
      prompt: "What criteria and evidence was I assigned for River Gardens?",
      setup: "Accepted assignment pinned to older material and criteria.",
      tools: ["get_reviewer_assignment"],
      outcome: "Describes the assigned versions accurately.",
    },
    "accept-invite": {
      prepare: (steps, f) => steps.respondToInvite(f, true),
      prompt: "I accept the River Gardens review invitation.",
      setup: "Current invited member with verified matching email.",
      tools: ["respond_to_review"],
      outcome: "Same assignment accepted and bound to reviewer.",
    },
    "decline-invite": {
      prepare: (steps, f) => steps.respondToInvite(f, false),
      prompt: "Please decline my River Gardens invitation.",
      setup: "Invited reviewer with no submission.",
      tools: ["respond_to_review"],
      outcome: "Declined; no access to protected material.",
    },
    "declare-conflict": {
      prepare: (steps, f) => steps.declareConflict(f),
      prompt: "Flag a conflict on River Gardens. I serve on its board.",
      setup: "Reviewer has accepted and saved a draft.",
      tools: ["respond_to_review"],
      outcome: "Conflict recorded, access paused, private work retained.",
    },
    "private-draft": {
      prepare: (steps, f) => steps.privateDraft(f),
      prompt:
        "Save my private draft: fund €200.50 because the shared meals benefit the neighbourhood. I’m still editing.",
      setup: "Accepted reviewer.",
      tools: ["save_reviewer_draft"],
      outcome:
        "Private draft contains amount and reason. No submitted assessment or manager notification.",
    },
    "submit-review": {
      prepare: (steps, f) => steps.submitReview(f, false),
      prompt: "I’m finished with my saved River Gardens review. Submit it to the manager.",
      setup: "Complete saved assessment with positive amount and reasoning.",
      tools: ["submit_reviewer_assessment"],
      outcome: "One submitted version with correct author and amount. One manager notification.",
    },
    "submit-amendment": {
      prepare: (steps, f) => steps.submitReview(f, true),
      prompt: "Submit my saved amendment to the River Gardens assessment.",
      setup:
        "Previous submission notice sent outside the cooldown. Changed draft with an amendment reason.",
      tools: ["submit_reviewer_assessment"],
      outcome:
        "Prior version retained; one new version with explanation and a manager notification.",
    },
    "complete-assignment": {
      prepare: (steps, f) => steps.completeAssignment(f),
      prompt:
        "Accept my River Gardens assignment, save my assessment of fund €200.50 because of the shared meals, and submit it.",
      setup: "Current verified reviewer with one invitation and no draft content.",
      tools: [
        "list_my_reviews",
        "get_reviewer_assignment",
        "respond_to_review",
        "save_reviewer_draft",
        "submit_reviewer_assessment",
      ],
      outcome:
        "One accepted assignment and one attributed submission based on the assigned material. Manager receives one notice.",
    },
  },
);
