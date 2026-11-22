import type { mcpScopes } from "@merit/mcp";

import type { Scenario, ScenarioContext } from "./scenario";

type Profile = { userId: string; scopes: readonly (typeof mcpScopes)[number][] };

export const manager: Profile = { userId: "dana", scopes: ["workspace:read", "grants:write"] };
export const demoManager: Profile = { ...manager, scopes: [...manager.scopes, "onboarding:write"] };
export const reviewer: Profile = {
  userId: "priya",
  scopes: ["workspace:read", "reviews:read", "reviews:write"],
};

type Criteria = {
  prompt: string;
  setup: string;
  tools: string[];
  optionalTools?: string[];
  toolMatch?: "any";
  relatedTools?: string[];
  outcome: string;
  partition?: "held-out";
  replyCriterion?: string;
};

export type EvalCase = Criteria & {
  id: string;
  workflow: string;
  profile: Profile;
  prepare: (ctx: ScenarioContext) => Promise<Scenario>;
};

export const defineWorkflow = <Steps, Fixture>(
  workflow: string,
  profile: Profile,
  load: () => Promise<Steps>,
  fixture: (context: ScenarioContext) => Fixture | Promise<Fixture>,
  definitions: Record<
    string,
    Criteria & {
      profile?: Profile;
      heldOut?: Criteria & { id: string };
      prepare: (steps: Steps, fixture: Fixture, heldOut: boolean) => Promise<Scenario>;
    }
  >,
): EvalCase[] =>
  Object.entries(definitions).flatMap(
    ([id, { prepare, heldOut, profile: actor = profile, ...criteria }]) => {
      const run = async (ctx: ScenarioContext, variant: boolean) =>
        prepare(await load(), await fixture(ctx), variant);

      const registered = {
        ...criteria,
        id,
        workflow,
        profile: actor,
        prepare: (ctx: ScenarioContext) => run(ctx, false),
      };
      return heldOut
        ? [
            registered,
            {
              ...heldOut,
              workflow,
              profile: actor,
              partition: "held-out" as const,
              prepare: (ctx: ScenarioContext) => run(ctx, true),
            },
          ]
        : [registered];
    },
  );

export const workspaceFixture = (ctx: ScenarioContext) => ctx;

export const reviewFixture = async (ctx: ScenarioContext) =>
  (await import("./workflows/review-fixture.ts")).createReviewFixture(ctx);
