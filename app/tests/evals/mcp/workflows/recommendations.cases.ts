import { defineWorkflow, manager, workspaceFixture } from "../definition.ts";

export const recommendationCases = defineWorkflow(
  "recommendations",
  manager,
  () => import("./recommendation-cases.ts"),
  workspaceFixture,
  {
    "save-proposal": {
      prepare: (steps, ctx) => steps.saveProposal(ctx, false),
      prompt:
        "Record my recommendation to fund Lanterns for €2,450.25 because the venue is secured.",
      setup: "Ready case with current evidence and recommendation revisions.",
      tools: ["save_recommendation"],
      outcome:
        "Recommendation records 245025 EUR cents, rationale and current basis. No award recorded.",
    },
    "committee-brief": {
      prepare: (steps, ctx) => steps.committeeBrief(ctx),
      prompt:
        "Brief the committee on what was requested, what was proposed and what has been decided on Lanterns.",
      setup: "Applicant requested €50,000. Reviewer proposed €30,000. No funding decision.",
      tools: ["get_application", "get_application_content"],
      outcome:
        "Clearly attributes both amounts, preserves the uncertainty, and makes no claim of an award.",
    },
    "record-award": {
      prepare: (steps, ctx) => steps.recordAward(ctx),
      relatedTools: ["save_recommendation", "record_assessment"],
      prompt: "The committee approved a final award for Lanterns. Record the decision.",
      setup: "Final award recording is outside Merit’s published workflow.",
      tools: [],
      outcome: "Explains the limitation. No substitute recommendation or commitment.",
    },
    "recommend-from-evidence": {
      prepare: (steps, ctx) => steps.saveProposal(ctx, true),
      prompt:
        "Check Jo’s assessment of Lanterns. If it uses the current evidence, record my recommendation for her proposed amount, citing her local-benefit finding.",
      setup:
        "Ready application with one current assessment from Jo and a superseded one for a different amount.",
      tools: [
        "get_application",
        "list_application_reviews",
        "get_application_content",
        "save_recommendation",
      ],
      outcome:
        "One recommendation, with the current assessment’s exact amount, correct finding and application version.",
      replyCriterion:
        "Confirms the recommendation with the recording date returned by Merit. Accurately distinguishes it from the assessment date.",
    },
  },
);
