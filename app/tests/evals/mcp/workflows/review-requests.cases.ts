import { defineWorkflow, manager, reviewFixture } from "../definition.ts";

export const reviewRequestCases = defineWorkflow(
  "manager-reviews",
  manager,
  () => import("./review-requests.ts"),
  reviewFixture,
  {
    "track-review": {
      prepare: (steps, f) => steps.reviewRequest(f, "track"),
      relatedTools: ["invite_reviewer"],
      prompt: "Put Priya down for a review of River Gardens. I’ll contact her myself.",
      setup: "Manager in Alder. Priya is an eligible contact. No prior request.",
      tools: ["request_review"],
      outcome: "One outstanding request for Priya. No assignment or email.",
      replyCriterion:
        "Confirms that Priya’s review is being tracked and distinguishes that from contacting her.",
      heldOut: {
        id: "reserve-track-review",
        relatedTools: ["invite_reviewer"],
        prompt:
          "Add Priya to the list of reviews we’re waiting for on River Gardens. I’ve already talked to her.",
        setup: "No request or assignment exists for the named contact.",
        tools: ["request_review"],
        outcome: "One outstanding request for Priya. No invitation.",
      },
    },
    "track-unassigned": {
      prepare: (steps, f) => steps.reviewRequest(f, "clarify"),
      relatedTools: ["request_review", "edit_application"],
      prompt: "Track that River Gardens needs a review. I’ll choose the reviewer later.",
      setup: "Manager in Alder. The user has not selected a reviewer.",
      tools: [],
      outcome: "Asks who should review the application and leaves it unchanged.",
      replyCriterion:
        "Asks the manager to identify the reviewer. Does not claim a review has been recorded.",
    },
    "invite-reviewer": {
      prepare: (steps, f) => steps.reviewRequest(f, "invite"),
      prompt: "Please email Priya her invitation to review River Gardens. There’s no due date.",
      setup:
        "Outstanding request for Priya; qualifying membership, matching contact and verified manager email in a standard workspace.",
      tools: ["invite_reviewer"],
      outcome: "One assignment and one invitation sent to Priya; no due date.",
      replyCriterion:
        "Accurately confirms sending Priya the invitation without claiming she received or accepted it.",
    },
    "compose-invite": {
      prepare: (steps, f, heldOut) => steps.reviewRequest(f, "draft", heldOut),
      relatedTools: ["invite_reviewer"],
      prompt: "Draft a short email I can send Priya myself inviting her to review River Gardens.",
      setup:
        "An outstanding request exists for Priya. The prompt supplies all details needed for wording.",
      tools: [],
      outcome: "Provides invitation copy without any Merit call, assignment or message.",
      replyCriterion:
        "Provides usable invitation copy for Priya and leaves sending it to the manager.",
      heldOut: {
        id: "reserve-write-invite",
        relatedTools: ["list_workspaces", "search_workspace", "get_application", "invite_reviewer"],
        prompt:
          "What could I say to invite Priya to assess River Gardens? Give me two sentences I can paste.",
        setup: "There is an outstanding request for Priya.",
        tools: [],
        outcome:
          "Gives the manager two invitation sentences to paste, using the supplied details and without claiming an invitation was already sent. No workspace lookups, writes or email.",
      },
    },
    "arrange-review": {
      prepare: (steps, f) => steps.reviewRequest(f, "arrange"),
      prompt:
        "Arrange for Priya to review River Gardens. Send her the invitation and tell me whether it went out.",
      setup: "Priya is a qualifying workspace member and contact. No request or assignment exists.",
      tools: ["request_review", "invite_reviewer"],
      relatedTools: ["list_application_reviewers"],
      outcome:
        "One request, one matching assignment and one invitation sent to Priya. The reply confirms sending without claiming inbox receipt or reviewer acceptance.",
    },
  },
);
