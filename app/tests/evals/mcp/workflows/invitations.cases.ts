import { defineWorkflow, manager, reviewFixture } from "../definition.ts";

export const invitationCases = defineWorkflow(
  "manager-reviews",
  manager,
  () => import("./invitation-scenarios.ts"),
  reviewFixture,
  {
    "invitation-status": {
      prepare: (steps, f) => steps.invitationStatus(f),
      relatedTools: ["invite_reviewer", "manage_reviewer_assignment"],
      prompt:
        "Who has been invited to assess River Gardens, and did Merit send the invitations successfully?",
      setup: "Priya’s invitation failed delivery. Jo only has an offline request.",
      tools: ["list_application_reviewers"],
      outcome: "Identifies Priya and the failed send. Jo has no invitation.",
    },
    "invitation-history": {
      prepare: (steps, f) => steps.invitationHistory(f),
      prompt: "When was Priya invited to review River Gardens, and when did she accept?",
      setup: "Manager can see invitation and acceptance events. Priya has a private draft.",
      tools: ["list_reviewer_history"],
      outcome: "Reports both event dates; no private draft content.",
    },
    "end-access": {
      prepare: (steps, f) => steps.endAccess(f),
      prompt: "End Priya’s access to the River Gardens assignment.",
      setup: "Priya accepted and saved a private draft.",
      tools: ["manage_reviewer_assignment"],
      outcome: "Assignment access ends. Private draft preserved.",
    },
    "reinstate-access": {
      prepare: (steps, f) => steps.reinstateAccess(f),
      prompt: "Restore Priya’s access to her River Gardens assignment.",
      setup: "Qualified member; manager previously ended access. No unresolved conflict.",
      tools: ["manage_reviewer_assignment"],
      outcome: "Same assignment reinstated, same evidence basis.",
    },
    "clear-conflict": {
      prepare: (steps, f) => steps.clearConflict(f),
      prompt: "Clear Priya’s conflict. The advisory relationship ended in 2020.",
      setup: "Paused for a conflict.",
      tools: ["manage_reviewer_assignment"],
      outcome: "Reason recorded and acceptance required before access resumes.",
    },
    "resend-invite": {
      prepare: (steps, f) => steps.resendInvite(f),
      prompt: "Priya’s invitation email failed. Please send it again.",
      setup: "Existing invitation eligible for retry.",
      tools: ["manage_reviewer_assignment"],
      outcome: "Second send for same invitation; one assignment.",
    },
    "retry-notice": {
      prepare: (steps, f) => steps.retryNotice(f),
      prompt: "Priya already submitted. Retry the failed notification to the manager.",
      setup: "Persisted submission with failed notification.",
      tools: ["manage_reviewer_assignment"],
      outcome: "Notification retried; no new submission or invitation.",
    },
  },
);
