import { randomUUID } from "node:crypto";

import { assert, expect, vi } from "vite-plus/test";

import { createFundingApplication, editFundingApplication } from "@merit/applications/server";
import { AuthenticationError } from "@merit/auth";
import { getFundingRoundPage, listFundingRounds } from "@merit/grantmaking/server";
import { applicationWork } from "@merit/grantmaking/server/integrations";
import { handleWorkspaceMcp } from "@merit/mcp";
import { encodeMoney } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";
import {
  loadFundingRoundPage,
  loadFundingRounds,
  loadWorkspaceActivity,
  loadWorkspaceSearch,
} from "@merit/product/grantmaking";
import { loadWorkspace } from "@merit/product/workspace";
import { type SaveRecommendationRequest } from "@merit/recommendations/api";
import { saveFundingRecommendation } from "@merit/recommendations/server";

import { transportTest as it, endpoint } from "./fixtures/transport-test";

it.for(["reviewer", "committee_reader"])(
  "does not expose the manager overview to a %s",
  async (role, { db, database, rounds: { pageInput }, transport: { services, callMcp } }) => {
    await database.client.query("UPDATE memberships SET role = $1 WHERE user_id = 'dana'", [role]);

    expect(await getFundingRoundPage(db, actor, pageInput)).toBeNull();
    expect(await listFundingRounds(db, actor, "alder")).toEqual({ status: "forbidden" });
    expect(await loadFundingRoundPage(pageInput, services)).toEqual({ status: "not_found" });
    expect(
      (
        await callMcp(actor.userId, {
          workspaceSlug: pageInput.workspaceSlug,
          roundId: pageInput.publicId,
        })
      ).isError,
    ).toBe(true);
  },
);

it("resolves membership even when the workspace has no funding rounds", async ({
  database,
  transport: { services },
}) => {
  await database.client.query("DELETE FROM application_cases WHERE organization_id = 'alder'");
  await database.client.query("DELETE FROM funding_rounds WHERE organization_id = 'alder'");

  expect(await loadWorkspace(services)).toMatchObject({
    status: "ok",
    workspace: { id: "alder", name: "Alder Foundation", slug: "alder" },
  });
  expect(await loadFundingRounds("alder", services)).toEqual({ status: "ok", rounds: [] });
});

it.for(["none", "administrator", "owner"])(
  "returns consistent authorized financial facts through web and MCP for %s",
  async (
    administration,
    {
      database,
      rounds: { pageInput, createApplication, recommendApplication },
      transport: { services, callMcp },
    },
  ) => {
    const application = await createApplication("Recommended application");
    await recommendApplication(application, "2500");
    if (administration === "owner") {
      await database.client.query(
        "UPDATE memberships SET administration='none' WHERE organization_id='alder'",
      );
    }
    await database.client.query("UPDATE memberships SET administration=$1 WHERE user_id='dana'", [
      administration,
    ]);
    const web = await loadFundingRoundPage(pageInput, services);
    const mcp = await callMcp(actor.userId, {
      workspaceSlug: pageInput.workspaceSlug,
      roundId: pageInput.publicId,
    });

    expect(web.status).toBe("ok");
    expect(mcp.isError).not.toBe(true);
    if (web.status !== "ok") {
      throw new Error("Expected authorized web read");
    }
    expect({
      budget: encodeMoney(web.round.budget!),
      requested: encodeMoney(web.round.totals.requested),
      proposed: encodeMoney(web.round.totals.proposed),
      remaining: encodeMoney(web.round.totals.remaining!),
    }).toEqual({
      budget: { currency: "EUR", minorUnits: "10000" },
      requested: { currency: "EUR", minorUnits: "8000" },
      proposed: { currency: "EUR", minorUnits: "2500" },
      remaining: { currency: "EUR", minorUnits: "7500" },
    });
    expect(mcp.structuredContent).toMatchObject({
      round: {
        roundId: pageInput.publicId,
        title: web.round.title,
        budget: encodeMoney(web.round.budget!),
        preparationRevision: web.preparation.revision,
        totals: {
          requested: encodeMoney(web.round.totals.requested),
          proposed: encodeMoney(web.round.totals.proposed),
          remaining: encodeMoney(web.round.totals.remaining!),
        },
      },
    });
    expect(await loadWorkspace(services)).toMatchObject({
      status: "ok",
      workspace: { id: "alder", canWorkOnGrants: true },
    });
    expect(await loadFundingRounds("alder", services)).toMatchObject({
      status: "ok",
      rounds: [{ organizationId: "alder" }],
    });
  },
);

it("rejects another organization through both transports without leaking its data", async ({
  db,
  rounds: { pageInput },
  transport: { services, callMcp },
}) => {
  expect(await loadWorkspace(services, "birch")).toEqual({ status: "workspace_not_found" });
  expect(await loadFundingRounds("birch", services)).toEqual({ status: "workspace_not_found" });
  expect(await listFundingRounds(db, actor, "birch")).toEqual({ status: "not_found" });

  const request = { workspaceSlug: "birch", roundId: pageInput.publicId };

  expect(await loadFundingRoundPage({ ...pageInput, workspaceSlug: "birch" }, services)).toEqual({
    status: "not_found",
  });

  const result = await callMcp(actor.userId, request);

  expect(result).toMatchObject({
    isError: true,
    structuredContent: { status: "not_found" },
  });
  expect(JSON.stringify(result)).not.toContain("Birch");
});

it("rechecks membership after revocation despite an unchanged identity", async ({
  db,
  database,
  rounds: { pageInput },
  transport: { services, callMcp },
}) => {
  expect((await loadFundingRoundPage(pageInput, services)).status).toBe("ok");

  await database.client.query("DELETE FROM memberships WHERE user_id = 'dana'");

  expect(await loadFundingRoundPage(pageInput, services)).toEqual({ status: "not_found" });
  expect(
    (
      await callMcp(actor.userId, {
        workspaceSlug: pageInput.workspaceSlug,
        roundId: pageInput.publicId,
      })
    ).isError,
  ).toBe(true);
  expect(await listFundingRounds(db, actor, "alder")).toEqual({ status: "not_found" });
});

it("rejects client-supplied identities before a scoped MCP read", async ({
  rounds: { pageInput },
  transport: { callMcp },
}) => {
  expect(
    (
      await callMcp(actor.userId, {
        workspaceSlug: "alder",
        roundId: pageInput.publicId,
        clerkUserId: "seed_birch",
      })
    ).isError,
  ).toBe(true);
});

it("blocks disabled users through both transports", async ({
  database,
  rounds: { pageInput },
  transport: { services, callMcp },
}) => {
  await database.client.query("UPDATE app_users SET active = false WHERE id = 'dana'");

  expect(await loadFundingRoundPage(pageInput, services)).toEqual({ status: "unavailable" });
  expect(
    (
      await callMcp(actor.userId, {
        workspaceSlug: pageInput.workspaceSlug,
        roundId: pageInput.publicId,
      })
    ).isError,
  ).toBe(true);
});

it("denies unauthenticated web and MCP reads", async ({
  rounds: { pageInput },
  transport: { services, mcpOperations, session },
}) => {
  session.userId = null;

  expect(await loadFundingRoundPage(pageInput, services)).toEqual({ status: "signed_out" });
  expect(await loadWorkspace(services)).toEqual({ status: "signed_out" });

  const read = vi.fn();
  const response = await handleWorkspaceMcp(
    new Request(endpoint, { headers: { host: endpoint.host } }),
    endpoint.href,
    {
      authenticate: async () => {
        throw new AuthenticationError("unauthenticated");
      },
      ...mcpOperations,
      grantmaking: { ...mcpOperations.grantmaking, readRound: read },
    },
  );

  expect(response.status).toBe(401);
  expect(response.headers.get("WWW-Authenticate")).toContain(
    "/.well-known/oauth-protected-resource/mcp/workspace",
  );
  expect(read).not.toHaveBeenCalled();
});

it("returns an empty authorized workspace consistently through both interfaces", async ({
  db,
  database,
  transport: { services, callMcp },
}) => {
  await database.client.query("DELETE FROM application_cases WHERE organization_id = 'alder'");
  await database.client.query("DELETE FROM funding_rounds WHERE organization_id = 'alder'");

  expect(await listFundingRounds(db, actor, "alder")).toEqual({ status: "ok", rounds: [] });
  expect(await loadFundingRounds("alder", services)).toEqual({ status: "ok", rounds: [] });
  expect(
    (await callMcp(actor.userId, { workspaceSlug: "alder" }, "list_funding_rounds"))
      .structuredContent,
  ).toEqual({ status: "ok", rounds: [], nextCursor: null });
});

it("denies round discovery to a reviewer even in an empty workspace", async ({
  db,
  database,
  transport: { services, callMcp },
}) => {
  await database.client.query("DELETE FROM application_cases WHERE organization_id = 'alder'");
  await database.client.query("DELETE FROM funding_rounds WHERE organization_id = 'alder'");
  await database.client.query("UPDATE memberships SET role = 'reviewer' WHERE user_id = 'dana'");

  expect(await listFundingRounds(db, actor, "alder")).toEqual({ status: "forbidden" });
  expect(await loadFundingRounds("alder", services)).toEqual({ status: "not_found" });
  expect(
    (await callMcp(actor.userId, { workspaceSlug: "alder" }, "list_funding_rounds"))
      .structuredContent,
  ).toEqual({ status: "forbidden" });
});

it("serves workspace activity to program managers and withholds it from everyone else through both interfaces", async ({
  database,
  transport: { services, callMcp },
}) => {
  const web = await loadWorkspaceActivity({ workspaceSlug: "alder" }, services);
  assert(web.status === "ok");
  expect(web.entries).toMatchObject([
    { action: "round.created", actor: "Dana Reed", record: { title: "Community grants" } },
  ]);
  const mcp = (await callMcp(actor.userId, { workspaceSlug: "alder" }, "list_workspace_activity"))
    .structuredContent;
  expect(mcp).toMatchObject({
    status: "ok",
    entries: web.entries.map(({ id, action }) => ({ id, action })),
  });

  await database.client.query("UPDATE memberships SET role = 'reviewer' WHERE user_id = 'dana'");
  expect(await loadWorkspaceActivity({ workspaceSlug: "alder" }, services)).toEqual({
    status: "not_found",
  });
  expect(
    (await callMcp(actor.userId, { workspaceSlug: "alder" }, "list_workspace_activity"))
      .structuredContent,
  ).toEqual({ status: "forbidden" });

  await database.client.query("DELETE FROM memberships WHERE user_id = 'dana'");
  expect(await loadWorkspaceActivity({ workspaceSlug: "alder" }, services)).toEqual({
    status: "workspace_not_found",
  });
  expect(
    (await callMcp(actor.userId, { workspaceSlug: "alder" }, "list_workspace_activity"))
      .structuredContent,
  ).toEqual({ status: "not_found" });
});

it("searches the workspace for program managers and withholds it from everyone else through both interfaces", async ({
  database,
  rounds: { createApplication },
  transport: { services, callMcp },
}) => {
  const application = await createApplication("Harbour lights");
  const search = { workspaceSlug: "alder", query: "harbour" };
  const web = await loadWorkspaceSearch(search, services);
  assert(web.status === "ok");
  expect(web.applications.results).toMatchObject([
    { id: application.publicId, title: "Harbour lights", roundTitle: "Community grants" },
  ]);
  expect((await callMcp(actor.userId, search, "search_workspace")).structuredContent).toEqual(web);

  await database.client.query("UPDATE memberships SET role = 'member' WHERE user_id = 'dana'");
  expect(await loadWorkspaceSearch(search, services)).toEqual({ status: "not_found" });
  expect((await callMcp(actor.userId, search, "search_workspace")).structuredContent).toEqual({
    status: "forbidden",
  });

  await database.client.query("DELETE FROM memberships WHERE user_id = 'dana'");
  expect(await loadWorkspaceSearch(search, services)).toEqual({ status: "workspace_not_found" });
  expect((await callMcp(actor.userId, search, "search_workspace")).structuredContent).toEqual({
    status: "not_found",
  });
});

it("conceals an empty workspace from a nonmember through both interfaces", async ({
  db,
  database,
  transport: { services, callMcp },
}) => {
  await database.client.query("DELETE FROM application_cases WHERE organization_id = 'alder'");
  await database.client.query("DELETE FROM funding_rounds WHERE organization_id = 'alder'");
  await database.client.query("DELETE FROM memberships WHERE user_id = 'dana'");

  expect(await listFundingRounds(db, actor, "alder")).toEqual({ status: "not_found" });
  expect(await loadFundingRounds("alder", services)).toEqual({ status: "workspace_not_found" });
  expect(
    (await callMcp(actor.userId, { workspaceSlug: "alder" }, "list_funding_rounds"))
      .structuredContent,
  ).toEqual({ status: "not_found" });
});

it.for(["administrator", "owner"])(
  "does not grant web, MCP, or save access merely for %s responsibility",
  async (
    administration,
    { db, database, rounds: { pageInput }, transport: { services, callMcp } },
  ) => {
    const application = await createFundingApplication(db, actor, {
      workspaceSlug: "alder",
      publicId: pageInput.publicId,
      requestId: randomUUID(),
      title: "Access check",
      applicant: "Community group",
      requested: "80.00",
      answers: [
        {
          questionId: "3c2131d3-d474-5e8e-bbe8-a56867995ea5",
          question: "Purpose",
          response: "Community activities.",
        },
      ],
    });
    assert(application.status === "ok");
    const address = { workspaceSlug: "alder", publicId: application.publicId };
    const ready = await editFundingApplication(
      db,
      actor,
      {
        ...address,
        expectedRevision: 0,
        change: { action: "mark_ready" },
      },
      applicationWork,
    );
    assert(ready.status === "ok");
    const request: SaveRecommendationRequest = {
      ...address,
      expectedRevision: 0,
      expectedApplicationVersion: 1,
      recommendation: {
        position: "Fund",
        allocation: { currency: "EUR", minorUnits: "4000" },
        reasoning: "Support the community activities.",
      },
    };
    await database.client.query(
      "UPDATE memberships SET administration='none' WHERE organization_id='alder'",
    );
    await database.client.query(
      "UPDATE memberships SET administration=$1, role='member' WHERE user_id='dana'",
      [administration],
    );

    expect(await getFundingRoundPage(db, actor, pageInput)).toBeNull();
    expect(await loadFundingRoundPage(pageInput, services)).toEqual({ status: "not_found" });
    expect(
      (
        await callMcp(actor.userId, {
          workspaceSlug: pageInput.workspaceSlug,
          roundId: pageInput.publicId,
        })
      ).isError,
    ).toBe(true);
    expect(await saveFundingRecommendation(db, actor, request)).toEqual({
      status: "not_found",
    });
    expect(await loadWorkspace(services, "alder")).toMatchObject({
      status: "ok",
      workspace: { role: "member" },
    });
    expect(await loadFundingRounds("alder", services)).toEqual({ status: "not_found" });
    expect(
      (await database.client.query("SELECT 1 FROM recommendation_versions")).rows,
    ).toHaveLength(0);
  },
);
