import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { criteriaVersionSchema } from "@merit/rounds/domain";

import { actor, endpoint, connect } from "../../tests/client";
import { testOperations } from "../../tests/operations";
import { handleWorkspaceMcp } from "../index";

const id = "k7m2p9x4n6rt";
const contactId = "00000000-0000-4000-a000-000000000001";

const round = {
  roundId: id,
  title: "Round",
  preparationRevision: 2,
  criteriaVersion: criteriaVersionSchema.parse(1),
  budget: { minorUnits: "9007199254740993", currency: "EUR" as const },
  applicationCount: 2,
  managerUserId: "test-manager",
  managerNeedsReassignment: false,
  totals: {
    requested: { minorUnits: "1000", currency: "EUR" as const },
    unknownRequests: 1,
    proposed: { minorUnits: "0", currency: "EUR" as const },
    remaining: { minorUnits: "9007199254740993", currency: "EUR" as const },
  },
};

describe("workspace MCP contracts", () => {
  it("discovers explicit workflows, validates round requests and preserves exact financial totals", async () => {
    const operations = testOperations();
    operations.workspace.readRound.mockResolvedValue({ status: "ok", round });
    const client = await connect(operations);
    try {
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names).toEqual(
        expect.arrayContaining([
          "list_applications",
          "list_workspace_activity",
          "get_application_content",
          "start_application_revision",
          "publish_application_revision",
          "delete_application",
          "request_review",
          "record_assessment",
          "archive_contact",
          "list_team_history",
        ]),
      );
      const result = await client.callTool({
        name: "get_funding_round",
        arguments: { workspaceSlug: "alder", roundId: id },
      });
      expect(result.structuredContent).toEqual({
        status: "ok",
        round,
        url: `http://localhost:3000/app/alder/rounds/${id}`,
      });
      for (const fields of [{}, { roundId: id, userId: "other" }]) {
        expect(
          (
            await client.callTool({
              name: "get_funding_round",
              arguments: { workspaceSlug: "alder", ...fields },
            })
          ).isError,
        ).toBe(true);
      }
    } finally {
      await client.close();
    }
  });
  it("challenges for missing OAuth scopes before executing the operation", async () => {
    const operations = testOperations();
    const response = await handleWorkspaceMcp(
      new Request(endpoint, {
        method: "POST",
        headers: {
          host: endpoint.host,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "create_funding_round",
            arguments: {
              workspaceSlug: "alder",
              requestId: "00000000-0000-4000-a000-000000000001",
              title: "New round",
            },
          },
        }),
      }),
      endpoint.href,
      { ...operations, authenticate: async () => ({ ...actor, scopes: ["workspace:read"] }) },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("WWW-Authenticate")).toContain('error="insufficient_scope"');
    expect(response.headers.get("WWW-Authenticate")).toContain("grants:write");
    expect(response.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
    expect(operations.workspace.createRound).not.toHaveBeenCalled();
  });
  it("does not allow deletion through the ordinary edit tool", async () => {
    const operations = testOperations();
    const client = await connect(operations);
    try {
      expect(
        (
          await client.callTool({
            name: "edit_application",
            arguments: {
              workspaceSlug: "alder",
              applicationId: id,
              expectedIntakeRevision: 4,
              change: { action: "delete" },
            },
          })
        ).isError,
      ).toBe(true);
      expect(operations.workspace.editApplication).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });
  it("publishes contact results without internal organization identifiers", async () => {
    const operations = testOperations();
    operations.workspace.changeContact.mockResolvedValue({
      status: "ok",
      contact: {
        id: contactId,
        organizationId: "private",
        name: "Sam",
        email: "",
        affiliation: "",
        archived: true,
        revision: 3,
      },
    });
    const client = await connect(operations);
    try {
      const result = await client.callTool({
        name: "archive_contact",
        arguments: { workspaceSlug: "alder", contactId, expectedContactRevision: 2 },
      });
      expect(result.structuredContent).toEqual({
        status: "ok",
        contact: {
          contactId,
          contactRevision: 3,
          name: "Sam",
          email: "",
          affiliation: "",
          archived: true,
        },
      });
      expect(JSON.stringify(result)).not.toContain("private");
    } finally {
      await client.close();
    }
  });
  it("preserves business conflicts and hides unexpected failures", async () => {
    const operations = testOperations();
    operations.workspace.editRound
      .mockResolvedValueOnce({ status: "conflict" })
      .mockRejectedValueOnce(new Error("private database detail"));
    const client = await connect(operations);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const call = {
        name: "edit_funding_round",
        arguments: {
          workspaceSlug: "alder",
          roundId: id,
          expectedPreparationRevision: 0,
          change: { section: "budget", amount: "100.50", reason: "Revised envelope" },
        },
      };
      expect((await client.callTool(call)).structuredContent).toEqual({ status: "conflict" });
      const failed = await client.callTool(call);
      expect(failed.structuredContent).toMatchObject({ status: "unavailable" });
      expect(JSON.stringify(failed)).not.toContain("private database detail");
    } finally {
      log.mockRestore();
      await client.close();
    }
  });
  it.each([
    { status: "ok" as const, rounds: [], nextCursor: null },
    { status: "not_found" as const },
    { status: "forbidden" as const },
  ])("retains round listing outcome $status", async (outcome) => {
    const operations = testOperations();
    operations.workspace.listRounds.mockResolvedValue(outcome);
    const client = await connect(operations);
    try {
      expect(
        (
          await client.callTool({
            name: "list_funding_rounds",
            arguments: { workspaceSlug: "alder" },
          })
        ).structuredContent,
      ).toEqual(outcome);
    } finally {
      await client.close();
    }
  });
  it("lists workspace activity with record links, people and filters, and follows its cursor", async () => {
    const operations = testOperations();
    const entry = {
      id: "00000000-0000-4000-a000-000000000009",
      recordedAt: "2027-01-20T12:00:00.000Z",
      actor: null,
      provenance: { interface: "mcp" as const, clientId: "grant-assistant" },
      action: "round.budget",
    };
    operations.workspace.listWorkspaceActivity.mockResolvedValue({
      status: "ok",
      entries: [
        { ...entry, record: { kind: "round", id, title: "Local Connections" } },
        { ...entry, action: "application.delete", record: null },
        {
          ...entry,
          action: "assessment.recorded",
          record: { kind: "application", id: "b8q3w5j7c2df", title: "Workshop Saturdays" },
        },
      ],
      people: [{ id: "private-person", name: "Private Person" }],
      nextCursor: "cursor",
    });
    const client = await connect(operations);
    try {
      const result = await client.callTool({
        name: "list_workspace_activity",
        arguments: {
          workspaceSlug: "alder",
          roundId: id,
          personId: "dana",
          after: "previous",
          limit: 3,
        },
      });

      expect(operations.workspace.listWorkspaceActivity).toHaveBeenCalledWith(actor, {
        workspaceSlug: "alder",
        roundId: id,
        personId: "dana",
        after: "previous",
        limit: 3,
      });
      expect(result.structuredContent).toEqual({
        status: "ok",
        entries: [
          {
            ...entry,
            record: {
              kind: "round",
              id,
              title: "Local Connections",
              url: `http://localhost:3000/app/alder/rounds/${id}`,
            },
          },
          { ...entry, action: "application.delete", record: null },
          {
            ...entry,
            action: "assessment.recorded",
            record: {
              kind: "application",
              id: "b8q3w5j7c2df",
              title: "Workshop Saturdays",
              url: "http://localhost:3000/app/alder/applications/b8q3w5j7c2df",
            },
          },
        ],
        people: [{ id: "private-person", name: "Private Person" }],
        nextCursor: "cursor",
      });
      for (const filter of [{ personId: "" }, { roundId: "not-an-id" }, { after: "***" }]) {
        expect(
          (
            await client.callTool({
              name: "list_workspace_activity",
              arguments: { workspaceSlug: "alder", ...filter },
            })
          ).isError,
        ).toBe(true);
      }
      expect(operations.workspace.listWorkspaceActivity).toHaveBeenCalledOnce();
    } finally {
      await client.close();
    }
  });
  it.each([
    { status: "not_found" as const },
    { status: "forbidden" as const },
    { status: "invalid" as const },
  ])("retains activity outcome $status", async (outcome) => {
    const operations = testOperations();
    operations.workspace.listWorkspaceActivity.mockResolvedValue(outcome);
    const client = await connect(operations);
    try {
      expect(
        (
          await client.callTool({
            name: "list_workspace_activity",
            arguments: { workspaceSlug: "alder" },
          })
        ).structuredContent,
      ).toEqual(outcome);
    } finally {
      await client.close();
    }
  });
  it("requires the grant read scope for workspace activity", async () => {
    const operations = testOperations();
    const response = await handleWorkspaceMcp(
      new Request(endpoint, {
        method: "POST",
        headers: {
          host: endpoint.host,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_workspace_activity", arguments: { workspaceSlug: "alder" } },
        }),
      }),
      endpoint.href,
      { ...operations, authenticate: async () => ({ ...actor, scopes: ["grants:write"] }) },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("WWW-Authenticate")).toContain("workspace:read");
    expect(operations.workspace.listWorkspaceActivity).not.toHaveBeenCalled();
  });
  it("publishes only contracted fields in identical text and structured results", async () => {
    const operations = testOperations();
    const source = { ...round, private: "private detail" };
    operations.workspace.readRound.mockResolvedValue({ status: "ok", round: source });
    const client = await connect(operations);
    try {
      const result = await client.callTool({
        name: "get_funding_round",
        arguments: { workspaceSlug: "alder", roundId: id },
      });
      expect(result.isError).toBe(false);
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent) },
      ]);
      expect(JSON.stringify(result)).not.toContain("private detail");
    } finally {
      await client.close();
    }
  });
  it.each([
    { name: "missing ID", fields: { publicId: undefined } },
    { name: "invalid ID", fields: { publicId: "private detail" } },
    { name: "unencoded bigint", fields: { publicId: 1n } },
    { name: "missing status", fields: { status: undefined } },
    { name: "unknown status", fields: { status: "private detail" } },
    { name: "incomplete error", fields: { status: "invalid" } },
  ])("contains $name and records a safe diagnostic", async ({ fields }) => {
    const operations = testOperations();
    operations.workspace.createRound.mockResolvedValue(
      Object.assign({ status: "ok" as const, publicId: id }, fields),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = await connect(operations);
    try {
      const result = await client.callTool({
        name: "create_funding_round",
        arguments: {
          workspaceSlug: "alder",
          requestId: "00000000-0000-4000-a000-000000000001",
          title: "New round",
        },
      });
      const diagnostic = z
        .object({ status: z.literal("unavailable"), diagnosticId: z.uuid() })
        .parse(result.structuredContent);
      expect(result.isError).toBe(true);
      expect(log).toHaveBeenCalledExactlyOnceWith("Workspace MCP operation failed.", {
        tool: "create_funding_round",
        stage: "response",
        diagnosticId: diagnostic.diagnosticId,
      });
      expect(JSON.stringify([result, log.mock.calls])).not.toContain("private detail");
    } finally {
      log.mockRestore();
      await client.close();
    }
  });
});
