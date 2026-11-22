import { defineWorkflow, manager, workspaceFixture } from "../definition.ts";

export const roundCases = defineWorkflow(
  "rounds",
  manager,
  () => import("./rounds.ts"),
  workspaceFixture,
  {
    "all-rounds": {
      prepare: (steps, ctx) => steps.allRounds(ctx),
      prompt: "Show me every funding round in Alder.",
      setup: "Enough rounds for two pages. Birch also has a round.",
      tools: ["list_funding_rounds"],
      outcome: "All and only Alder’s rounds appear.",
    },
    "round-demand": {
      prepare: (steps, ctx) => steps.demand(ctx),
      prompt:
        "How much did Community Arts applicants ask for altogether? How many left the amount blank?",
      setup: "The round spans several pages and contains both unknown and zero amounts.",
      tools: ["get_funding_round"],
      outcome: "Reports whole-round requested EUR and exact unknown count.",
    },
    "original-criteria": {
      prepare: (steps, ctx) => steps.historicalCriteria(ctx),
      prompt: "What guidance did reviewers see for Impact in the first version?",
      setup:
        "Current round is Community Arts. Its original Impact criterion had different guidance.",
      tools: ["get_funding_round_content"],
      outcome: "Quotes the original guidance.",
    },
    "round-changes": {
      prepare: (steps, ctx) => steps.roundChanges(ctx),
      prompt: "Walk me through what changed in Community Arts, earliest first.",
      setup: "Several recorded preparation changes span pages.",
      tools: ["list_funding_round_history"],
      outcome: "Changes and order match the complete history.",
    },
    "new-round": {
      prepare: (steps, ctx) => steps.newRound(ctx, false),
      prompt: "Set up a new round called Harbour Access. We haven’t decided on the budget.",
      setup: "Manager in Alder. No such round exists.",
      tools: ["create_funding_round"],
      outcome: "One new round with unset budget and the creating manager.",
    },
    "change-budget": {
      prepare: (steps, ctx) => steps.budgetChange(ctx, false),
      prompt:
        "If the Community Arts budget is still €10,000, raise it to €12,000 for the additional donor contribution.",
      setup: "Budget is €10,000 throughout the read.",
      tools: ["edit_funding_round"],
      outcome: "One change to the intended round with the reason and €12,000.",
    },
    "budget-moved": {
      prepare: (steps, ctx) => steps.budgetChange(ctx, true),
      prompt:
        "If the Community Arts budget is still €10,000, raise it to €12,000 for the additional donor contribution.",
      setup: "A colleague raises the budget to €11,000 between read and save.",
      tools: ["edit_funding_round"],
      outcome: "Reports the conflict or changed condition. €11,000 remains in place.",
    },
    "remove-empty-round": {
      prepare: (steps, ctx) => steps.emptyRound(ctx),
      prompt: "Delete the empty rehearsal round called Dry Run. I confirm that name.",
      setup: "Empty rehearsal round sits next to a real funding round.",
      tools: ["delete_funding_round"],
      outcome: "Only Dry Run disappears; deletion is recorded.",
    },
    "prepare-round": {
      prepare: (steps, ctx) => steps.newRound(ctx, true),
      prompt:
        "Create a Harbour Access round, assign Mina as its manager, and give it a €12,000 budget for the new donor contribution.",
      setup: "Mina is an active program manager, with no similarly named round.",
      tools: ["create_funding_round", "list_team_members", "edit_funding_round"],
      optionalTools: ["get_funding_round"],
      outcome: "One round has the intended manager, exact budget and recorded reason.",
    },
  },
);
