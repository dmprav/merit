import { defineWorkflow, manager, demoManager, workspaceFixture } from "../definition.ts";

export const discoveryCases = defineWorkflow(
  "discovery",
  manager,
  () => import("./discovery.ts"),
  workspaceFixture,
  {
    "resume-demo": {
      profile: demoManager,
      prepare: (steps, ctx) => steps.demoScenario(ctx, false),
      prompt: "Take me back to the sample workspace I tried yesterday.",
      setup: "Signed-in account with an active demo.",
      tools: ["list_workspaces", "start_demo"],
      toolMatch: "any",
      outcome:
        "Links to the existing demo workspace or its example round. The original workspace and round are preserved.",
    },
    "accessible-workspaces": {
      prepare: (steps, ctx) => steps.accessibleWorkspaces(ctx),
      prompt: "Which grant workspaces can I open in Merit?",
      setup: "The account belongs to Alder and Birch. Cedar is inaccessible.",
      tools: ["list_workspaces"],
      outcome: "Lists only Alder and Birch.",
    },
    "round-managers": {
      prepare: (steps, ctx) => steps.managers(ctx),
      prompt: "Who in Alder can take charge of a funding round?",
      setup: "Mina is an active program manager. Jo is a reviewer.",
      tools: ["list_team_members"],
      outcome: "Identifies Mina as eligible. No membership changes.",
    },
    "find-application": {
      prepare: (steps, ctx) => steps.findApplication(ctx),
      prompt: "Find Eastside Arts’ Harbor Mural application in Alder.",
      setup: "Two projects share that title and have different applicants.",
      tools: ["search_workspace"],
      outcome: "Links to the Eastside Arts application.",
    },
    "recent-activity": {
      prepare: (steps, ctx) => steps.recentActivity(ctx),
      prompt: "Who made the two most recent changes to shared grant work in Alder?",
      setup: "Two dated changes and a later private reviewer draft.",
      tools: ["list_workspace_activity"],
      outcome:
        "Identifies both public-to-workspace events and actors in order. Private draft stays private.",
    },
    "general-advice": {
      prepare: (steps) => steps.generalAdvice(),
      relatedTools: ["list_application_reviews"],
      prompt: "What makes a grant review useful?",
      setup: "General writing advice. No case was named.",
      tools: [],
      outcome: "Gives general advice without a Merit call.",
    },
    "find-email": {
      prepare: (steps) => steps.findEmail(),
      relatedTools: ["search_workspace"],
      prompt: "Did Priya email me about the review delay yesterday?",
      setup: "A competing mail search tool can retrieve Priya’s message.",
      tools: [],
      outcome: "Uses the email source and answers from the message without calling Merit.",
    },
    "demo-to-round": {
      profile: demoManager,
      prepare: (steps, ctx) => steps.demoScenario(ctx, true),
      prompt: "Open my sample workspace and tell me how much money is left in its example round.",
      setup: "A signed-in user has an active example and the grants to open it.",
      tools: ["get_funding_round"],
      optionalTools: ["start_demo"],
      outcome:
        "Reads the existing demo's example round and reports its remaining budget. The same demo is preserved.",
    },
  },
);
