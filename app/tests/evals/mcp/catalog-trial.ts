import { createMCPClient } from "@tanstack/ai-mcp";
import { assert, expect } from "vite-plus/test";
import { z } from "zod";

import { roundTest } from "@merit/grantmaking/testing/rounds";
import { actor } from "@merit/organizations/testing/workspace";

import { createTransport } from "../../fixtures/transport-test";
import { gradeTrial } from "./grade";
import { evalCases } from "./registry";
import type { Scenario, ScenarioContext } from "./scenario";
import { serveTrial } from "./server";

const content = z.record(z.string(), z.unknown());

export const catalogTest = roundTest.extend(
  "catalog",
  async ({ db, database, rounds }, { onCleanup }) => {
    const recipients: string[] = [];
    const transport = createTransport(
      db,
      {
        isOperator: async () => false,
        verifiedEmails: async ({ userId }) => [`${userId}@example.test`],
        displayName: async ({ userId }) => userId,
      },
      async ({ to }) => {
        recipients.push(to);
      },
    );
    let closeServer: (() => Promise<void>) | undefined;
    onCleanup(async () => {
      try {
        await closeServer?.();
      } finally {
        await transport.close();
      }
    });
    const context: ScenarioContext = {
      db,
      sql: database.client,
      recipients,
      roundId: rounds.pageInput.publicId,
      createApplication: rounds.createApplication,
      seed: async (name, args, userId = actor.userId) => {
        const response = await transport.callMcp(userId, args, name);
        expect(response.isError, `Scenario setup call ${name} for ${userId} failed`).not.toBe(true);
        return content.parse(response.structuredContent);
      },
    };
    return async (id: string) => {
      const item = evalCases.find((definition) => definition.id === id);
      assert(item, `Missing scenario definition for ${id}`);
      const scenario = await item.prepare(context);
      recipients.length = 0;
      const server = await serveTrial(
        transport.mcpOperations,
        item.profile.userId,
        item.profile.scopes,
        scenario,
      );
      closeServer = server.close;

      const scripted = async (control: Scenario["control"] = scenario.control) => {
        const connect = (url: string) =>
          createMCPClient({
            name: "scripted-control",
            transport: { type: "http", url, headers: { Authorization: `Bearer ${server.token}` } },
          });

        const client = await connect(server.url);
        try {
          await client.tools();
          const mail = server.mailUrl ? await connect(server.mailUrl) : undefined;
          try {
            await mail?.tools();
            return await control(async (name, args) => {
              const source = name === "search_mail" && mail ? mail : client;
              const result = await source.callTool(name, args);
              return content.parse(result.structuredContent);
            });
          } finally {
            await mail?.close();
          }
        } finally {
          await client.close();
        }
      };

      const grade = async (reply: string, trace = server.trace) =>
        (await gradeTrial(item, { scenario, server: { ...server, trace }, recipients }, reply))
          .grade;

      return {
        item,
        scenario,
        server,
        recipients,
        scripted,
        grade,
        meritUserId: item.profile.userId,
      };
    };
  },
);
