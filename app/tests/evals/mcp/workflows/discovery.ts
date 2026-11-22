import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";
import { z } from "zod";

import { productLinks } from "@merit/product/links";

import { endpoint } from "../../../fixtures/transport-test";
import { successfulCalls, type Scenario, type ScenarioContext } from "../scenario";
import * as client from "./client";
import * as controls from "./grant-controls";
import { addMember, alder } from "./round-fixtures";

const demoState = z.object({
  demo: z.object({ workspaceSlug: z.string(), workspaceId: z.string(), roundRef: z.string() }),
});

const demoDestinations = (reply: string) => {
  // For Markdown links, use the destination even when the label itself looks like a URL.
  const links =
    /\[[^\]\n]*\]\(\s*<?([^\s)>]+)>?[^)]*\)|(?:^|[\s<(])((?:https?:\/\/|\/app\/)[^\s<>)\]]+)/gi;
  return Array.from(reply.matchAll(links), ([, href, bare = ""]) => {
    const url = URL.parse(href ?? bare.replace(/[.,;:!?]+$/, ""), endpoint);
    return url && url.origin + url.pathname.replace(/\/$/, "");
  });
};

export const demoScenario = async (ctx: ScenarioContext, readRound: boolean): Promise<Scenario> => {
  const { demo } = demoState.parse(await ctx.seed("start_demo", {}));
  const address = { workspaceSlug: demo.workspaceSlug, roundId: demo.roundRef };
  const overview = z.object({
    round: z.object({ totals: z.object({ remaining: z.object({ minorUnits: z.string() }) }) }),
  });
  const expected = overview.parse(await ctx.seed("get_funding_round", address)).round.totals
    .remaining;
  const remaining = Number(expected.minorUnits) / 100;
  return {
    control: controls.openDemo(readRound),
    async verifyEffects() {
      const workspaces = await ctx.sql.query("SELECT id FROM organizations WHERE kind='demo'");
      expect(workspaces.rows).toEqual([{ id: demo.workspaceId }]);
      const round = await ctx.sql.query(
        "SELECT id FROM funding_rounds WHERE organization_id=$1 AND id=$2",
        [demo.workspaceId, demo.roundRef],
      );
      expect(round.rowCount).toBe(1);
    },
    verifyTrace(trace) {
      if (readRound) {
        expect(
          successfulCalls(trace, "get_funding_round").some(
            (call) =>
              call.arguments?.workspaceSlug === address.workspaceSlug &&
              call.arguments.roundId === address.roundId &&
              overview.safeParse(call.outcome.content).data?.round.totals.remaining.minorUnits ===
                expected.minorUnits,
          ),
        ).toBe(true);
      }
    },
    verifyReply(reply, serverUrl) {
      if (readRound) {
        const amounts = reply.match(/-?\d+(?:[,\u00a0\u202f ]\d{3})*(?:\.\d+)?/g) ?? [];
        expect(amounts.map((amount) => Number(amount.replace(/[,\s]/g, "")))).toContain(remaining);
      } else {
        const home = productLinks.workspaceHome({
          slug: demo.workspaceSlug,
          canWorkOnGrants: true,
          canViewTeam: true,
        });
        const roundPath = home + "/" + demo.roundRef;
        const allowed = [
          new URL(home, endpoint).href,
          new URL(roundPath, endpoint).href,
          new URL(roundPath, serverUrl ?? endpoint).href,
        ];
        const destinations = demoDestinations(reply);
        expect(
          allowed.some((url) => destinations.includes(url)),
          "Expected a link to the existing demo workspace or its example round",
        ).toBe(true);
      }
    },
  };
};

export const accessibleWorkspaces = async (ctx: ScenarioContext): Promise<Scenario> => {
  await ctx.sql.query(
    "INSERT INTO memberships(organization_id,user_id,role) VALUES('birch','dana','member')",
  );
  await ctx.sql.query(
    "INSERT INTO organizations(id,slug,name) VALUES('cedar','cedar','Cedar Foundation')",
  );
  return {
    control: async (call) => (await client.workspaces(call)).map((x) => x.name).join(", "),
    verifyReply(reply) {
      expect(reply).toMatch(/alder/i);
      expect(reply).toMatch(/birch/i);
      expect(reply).not.toMatch(/cedar/i);
    },
  };
};

export const managers = async (ctx: ScenarioContext): Promise<Scenario> => {
  await addMember(ctx, "mina", "Mina Shaw", "program_manager");
  await addMember(ctx, "jo", "Jo Young", "reviewer");

  const memberships = async () =>
    (
      await ctx.sql.query<{ user_id: string; role: string; version: number }>(
        "SELECT user_id, role, version FROM memberships WHERE organization_id='alder' ORDER BY user_id",
      )
    ).rows;

  const before = await memberships();
  return {
    control: async (call) => {
      const members = z
        .array(z.object({ name: z.string().nullable(), role: z.string(), active: z.boolean() }))
        .parse(
          await client.pages(
            call,
            "list_team_members",
            await client.alderWorkspace(call),
            "members",
          ),
        );
      return `Eligible managers: ${members
        .filter((x) => x.active && x.role === "program_manager")
        .map((x) => x.name)
        .join(", ")}.`;
    },
    verifyReply(reply) {
      expect(reply).toMatch(/\bMina\b/i);
      expect(reply).toMatch(/\bDana\b/i);
      expect(reply).not.toMatch(/\bJo\b/i);
    },
    async verifyEffects() {
      expect(await memberships()).toEqual(before);
    },
  };
};

export const findApplication = async (ctx: ScenarioContext): Promise<Scenario> => {
  const create = async (applicant: string) =>
    z.string().parse(
      (
        await ctx.seed("create_application", {
          ...alder,
          roundId: ctx.roundId,
          requestId: randomUUID(),
          title: "Harbor Mural",
          applicant,
          requested: "500",
          answers: [],
        })
      ).applicationId,
    );

  const eastside = await create("Eastside Arts");
  const westside = await create("Westside Arts");
  return {
    control: async (call) => {
      const result = await client.search(call, "Eastside Arts Harbor Mural");
      const [found] = result.applications.results;
      assert(found && result.applications.total === 1);
      return found.title + ": /app/" + result.workspaceSlug + "/applications/" + found.id;
    },
    verifyReply(reply) {
      expect(reply).toContain(`/app/alder/applications/${eastside}`);
      expect(reply).not.toContain(`/app/alder/applications/${westside}`);
    },
  };
};

export const recentActivity = async (ctx: ScenarioContext): Promise<Scenario> => {
  await addMember(ctx, "mina", "Mina Shaw", "program_manager");
  await addMember(ctx, "jo", "Jo Young", "reviewer");
  const address = {
    ...alder,
    applicationId: (await ctx.createApplication("Harbor Garden")).publicId,
  };
  const contactId = randomUUID();
  const requestId = randomUUID();
  expect(
    await ctx.seed("create_contact", {
      ...alder,
      contactId,
      details: { name: "Jo Young", email: "jo@example.test", affiliation: "" },
    }),
  ).toMatchObject({ status: "ok" });
  expect(
    await ctx.seed("request_review", {
      ...address,
      expectedReviewRevision: 0,
      expectedApplicationVersion: 1,
      expectedCriteriaVersion: 1,
      id: requestId,
      contactId,
      replacesId: null,
    }),
  ).toMatchObject({ status: "ok" });
  const assignmentSchema = z.object({
    assignment: z.object({ id: z.string(), revision: z.number() }),
  });
  const assignment = assignmentSchema.parse(
    await ctx.seed("invite_reviewer", {
      ...address,
      requestId,
      commandId: randomUUID(),
      dueDate: null,
    }),
  ).assignment;
  expect(
    await ctx.seed(
      "respond_to_review",
      {
        assignmentId: assignment.id,
        commandId: randomUUID(),
        expectedRevision: assignment.revision,
        action: "accept",
        note: "",
      },
      "jo",
    ),
  ).toMatchObject({ status: "ok" });
  const draft = z
    .object({ draft: z.object({ revision: z.number() }) })
    .parse(await ctx.seed("get_reviewer_assignment", { assignmentId: assignment.id }, "jo")).draft;
  const round = { ...alder, roundId: ctx.roundId };
  expect(
    await ctx.seed(
      "edit_funding_round",
      {
        ...round,
        expectedPreparationRevision: 0,
        change: { section: "budget", amount: "125", reason: "Donor contribution" },
      },
      "mina",
    ),
  ).toMatchObject({ status: "ok" });
  expect(
    await ctx.seed("edit_funding_round", {
      ...round,
      change: { section: "details", title: "Revised community round" },
    }),
  ).toMatchObject({ status: "ok" });
  const note = "Draft-only detail: copper finch";
  expect(
    await ctx.seed(
      "save_reviewer_draft",
      {
        assignmentId: assignment.id,
        expectedDraftRevision: draft.revision,
        commandId: randomUUID(),
        draft: { position: "Fund", amount: "40.00", reasoning: note, observations: [], note: "" },
      },
      "jo",
    ),
  ).toMatchObject({ status: "ok" });
  return {
    control: async (call) => {
      const result = await call("list_workspace_activity", {
        ...(await client.alderWorkspace(call)),
        limit: 2,
      });
      expect(result.entries).toMatchObject([
        { actor: "Dana Reed" },
        { actor: "Mina Shaw", action: "round.budget_changed" },
      ]);
      return "Most recently Dana Reed renamed the round. Before that Mina Shaw updated the budget.";
    },
    verifyReply(reply) {
      expect(reply).toMatch(/Dana/i);
      expect(reply).toMatch(/(?:renam|titl|details)/i);
      expect(reply).toMatch(/Mina/i);
      expect(reply).toMatch(/budget/i);
      if (reply.search(/Mina/i) < reply.search(/Dana/i)) {
        expect(reply).toMatch(/earlier|first|previous|before|later|then|most recent|latest/i);
      }
      expect(reply).not.toMatch(
        /(?:latest|most recent)\w*[^.!?\n]{0,25}Mina|Mina[^.!?\n]{0,20}(?:most recent|latest)/i,
      );
      expect(reply).not.toMatch(/copper finch/i);
    },
  };
};

export const generalAdvice = async (): Promise<Scenario> => {
  return {
    allowDiscovery: false,
    control: async () =>
      "A useful grant review connects evidence to each criterion, explains tradeoffs, and flags gaps for the decision maker.",
    verifyTrace(trace) {
      expect(trace).toHaveLength(0);
    },
  };
};

export const findEmail = async (): Promise<Scenario> => {
  const yesterday = new Date();
  yesterday.setHours(12, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  const externalMail = {
    receivedAt: yesterday.toISOString(),
    from: "priya@example.test",
    subject: "Review delay",
    body: "My site visit was postponed. I will send the review on Thursday.",
  };
  return {
    allowDiscovery: false,
    externalMail,
    checkSelection: (calls) =>
      successfulCalls(calls, "search_mail").length > 0 &&
      calls.every((call) => call.source === "mailbox" && call.name === "search_mail")
        ? []
        : ["Expected a mail search without a Merit call"],
    control: async (call) => {
      const result = await call("search_mail", { query: "Priya review delay" });
      return "Yes. Priya wrote: " + z.string().parse(result.body);
    },
    verifyTrace(trace) {
      expect(trace).toContainEqual(
        expect.objectContaining({ source: "mailbox", name: "search_mail" }),
      );
    },
    verifyReply(reply) {
      expect(reply).toMatch(
        /yes|yesterday|Priya.{0,30}(?:email|wrote|said|sent)|(?:email|message) from Priya/i,
      );
      expect(reply).toMatch(/site visit|thursday/i);
    },
  };
};
