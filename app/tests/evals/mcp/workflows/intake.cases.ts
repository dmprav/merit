import { defineWorkflow, manager, workspaceFixture } from "../definition.ts";

export const intakeCases = defineWorkflow(
  "intake",
  manager,
  () => import("./intake.ts"),
  workspaceFixture,
  {
    "new-application": {
      prepare: (steps, ctx) => steps.newApplication(ctx),
      prompt:
        "Record a Community Arts application called River Lights. The requested amount hasn’t come in.",
      setup: "Round exists and has no record for River Lights.",
      tools: ["create_application"],
      outcome: "One preparation record with unknown requested amount.",
    },
    "staff-note": {
      prepare: (steps, ctx) => steps.staffNote(ctx),
      prompt: "Add this staff summary to Lanterns: Applicant confirmed the venue by phone.",
      setup: "Lanterns has recorded applicant material and an assessment.",
      tools: ["edit_application"],
      outcome: "Summary saved; applicant evidence and assessment basis preserved.",
    },
    "applicant-contact": {
      prepare: (steps, ctx) => steps.applicantContact(ctx),
      prompt: "Make Priya Rao the contact person for Lanterns.",
      setup: "Priya is an unambiguous existing active contact.",
      tools: ["select_application_contact"],
      outcome: "Application links to Priya. Her profile is unchanged.",
    },
    "ready-for-review": {
      prepare: (steps, ctx) => steps.readyForReview(ctx),
      prompt: "Intake for Lanterns is complete. Mark it ready for reviewers.",
      setup: "Preparation record contains all required material.",
      tools: ["mark_application_ready"],
      outcome: "Ready without a new request or invitation.",
    },
    "open-revision": {
      prepare: (steps, ctx) => steps.revisions(ctx, "open"),
      prompt: "The Lanterns applicant sent revised material. Open a shared working copy.",
      setup: "Ready application with no working revision.",
      tools: ["start_application_revision"],
      outcome: "One revised submission draft. Current material is preserved.",
    },
    "save-correction": {
      prepare: (steps, ctx) => steps.revisions(ctx, "save"),
      prompt:
        "In the open Lanterns correction, save the amount as €2,500. We transcribed it incorrectly. Keep the recorded version current.",
      setup: "Open correction on a current €2,000 version.",
      tools: ["save_application_revision"],
      outcome: "Draft contains €2,500 and the explanation. Current amount remains €2,000.",
    },
    "publish-correction": {
      prepare: (steps, ctx) => steps.revisions(ctx, "publish"),
      prompt: "Make the saved Lanterns correction its current intake record.",
      setup: "Complete changed correction with explanation.",
      tools: ["publish_application_revision"],
      outcome: "Corrected evidence becomes current once. Previous version remains readable.",
    },
    "discard-correction": {
      prepare: (steps, ctx) => steps.revisions(ctx, "discard"),
      prompt: "Discard the open Lanterns correction and keep the recorded submission.",
      setup: "Open correction differs from current material.",
      tools: ["discard_application_revision"],
      outcome: "Working correction cleared. Current version and evidence unchanged.",
    },
    "withdraw-case": {
      prepare: (steps, ctx) => steps.withdrawal(ctx, false),
      prompt: "Record that Lanterns withdrew on 1 October 2025 because the venue closed.",
      setup: "Active case with an outstanding request. Trial date is later.",
      tools: ["withdraw_application"],
      outcome: "Withdrawal date and reason recorded; outstanding request closed.",
    },
    "reinstate-case": {
      prepare: (steps, ctx) => steps.withdrawal(ctx, true),
      prompt: "Restore Lanterns to active work. The venue reopened.",
      setup: "Previously ready withdrawn application; old request closed.",
      tools: ["reinstate_application"],
      outcome: "Ready again with reason. Old request stays closed.",
    },
    "delete-duplicate": {
      prepare: (steps, ctx) => steps.deleteDuplicate(ctx),
      prompt: "Delete the unused preparation record called Duplicate Lanterns.",
      setup: "Never ready, no reviews or recommendation.",
      tools: ["delete_application"],
      outcome: "Only the duplicate disappears. Its deletion is recorded.",
    },
    "ambiguous-withdrawal": {
      prepare: (steps, ctx) => steps.ambiguousWithdrawal(ctx),
      relatedTools: ["withdraw_application"],
      prompt: "Withdraw Lanterns.",
      setup: "Two applications in different rounds have this title. No prior context resolves it.",
      tools: [],
      outcome: "Asks which case before any write.",
    },
    "revise-material": {
      prepare: (steps, ctx) => steps.revisions(ctx, "revise"),
      prompt:
        "Correct Lanterns’ recorded amount from €2,000 to €2,500 because staff transcribed it incorrectly. Make the correction current.",
      setup: "Ready case with earlier reviews and no working draft.",
      tools: [
        "get_application",
        "start_application_revision",
        "save_application_revision",
        "publish_application_revision",
      ],
      outcome:
        "One published correction retains prior evidence and the explanation. Existing assessments remain attached to the evidence reviewed.",
    },
  },
);
