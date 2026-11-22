import { defineWorkflow, manager, workspaceFixture } from "../definition.ts";

export const applicationReadCases = defineWorkflow(
  "intake",
  manager,
  () => import("./application-reads.ts"),
  workspaceFixture,
  {
    "all-applications": {
      prepare: (steps, ctx) => steps.allApplications(ctx),
      prompt: "Give me every project title in Community Arts.",
      setup: "Applications span pages and another round contains extra projects.",
      tools: ["list_applications"],
      outcome: "Lists every project in the intended round exactly once.",
    },
    "current-material": {
      prepare: (steps, ctx) => steps.currentMaterial(ctx),
      prompt: "Is Lanterns ready for review, and which version of its submission is current?",
      setup: "Ready version 2 has a separate working revision.",
      tools: ["get_application"],
      outcome: "Reports ready and version 2.",
    },
    "original-evidence": {
      prepare: (steps, ctx) => steps.originalEvidence(ctx, false),
      prompt: "Quote the sentence saying how many workshops Lanterns originally promised.",
      setup: "Original material says four after the first chunk. Current material says six.",
      tools: ["get_application_content"],
      outcome: "Cites the original sentence with four.",
    },
    "original-evidence-late": {
      prepare: (steps, ctx) => steps.originalEvidence(ctx, true),
      prompt: "Quote the sentence saying how many workshops Lanterns originally promised.",
      setup:
        "Intake began with just a title. The first recorded answer in version 2 promises four workshops. The current answer promises six.",
      tools: ["get_application_content"],
      outcome:
        "Quotes the original four-workshop sentence from the first available answer and checks its recorded source.",
    },
    "intake-changes": {
      prepare: (steps, ctx) => steps.intakeChanges(ctx),
      prompt: "Which intake changes have staff made to Lanterns, in order?",
      setup: "Includes a summary edit within one material version.",
      tools: ["list_application_history"],
      outcome: "Lists the summary and material changes in recorded order.",
    },
  },
);
