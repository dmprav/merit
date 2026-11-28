import { sql } from "drizzle-orm";
import { assert, expect, vi } from "vite-plus/test";

import { withDatabase } from "@merit/db";
import { createAssistantStore } from "@merit/organizations/server/assistant";
import { workspaceTest as it } from "@merit/organizations/testing/workspace";

import { conversationState } from "../src/server/assistant/state";
import { createAssistantTurns } from "../src/server/assistant/turns.server";

it("rolls back the catalog write and saves its business rejection on the approved action", async ({
  database,
}) => {
  const runtime = await database.createRuntimeConnection();
  const store = createAssistantStore((operation) => withDatabase(runtime, operation));
  const actor = { userId: "birch-manager" };
  const workspace = "birch";
  await store.setConsent(actor, workspace, true);
  const original = "Birch Foundation";
  const marker = "Proposed name";
  const preview = {
    name: "rename",
    input: { name: marker },
    targets: [],
    effects: ["Rename the workspace"],
  };
  const rejected = { status: "invalid", reason: "Name already in use" };
  const citation = { kind: "organization", recordId: workspace, version: "1", label: original };
  const turns = createAssistantTurns({
    store,
    model: async () => ({ kind: "calls", calls: [{ name: preview.name, input: preview.input }] }),
    catalog: (_actor, _workspace, tx) => ({
      list: async () => [
        { name: preview.name, write: true, description: "Rename", inputSchema: {} },
      ],
      permits: async () => true,
      preview: async () => ({ preview, result: { status: "ok" }, citations: [], dependencies: [] }),
      execute: async () => {
        assert.isDefined(tx);
        const changed = await tx.execute(
          sql`update organizations set name = ${marker} where id = ${workspace} and name = ${original} returning name`,
        );
        expect(changed.rows).toEqual([{ name: marker }]);
        return { result: rejected, citations: [citation], dependencies: [{ kind: "membership" }] };
      },
      read: vi.fn(),
      deliver: vi.fn(),
      retryDelivery: vi.fn(),
    }),
  });
  const chat = await turns.create(actor, workspace);
  const address = [actor, workspace, chat.id] as const;
  await turns.start(...address, { message: "Rename the workspace." });
  await turns.advance(...address);
  const group = (await turns.open(...address))?.groups[0];
  assert.isDefined(group);
  await turns.approve(...address, { previewId: group.id });
  await turns.advance(...address);

  const saved = await turns.open(...address);
  expect(saved?.groups[0]?.actions[0]).toMatchObject({ status: "failed", result: rejected });
  const stored = await store.read(...address);
  const { messages, sources, dependencies } = conversationState.parse(stored?.state);
  const source = { ...citation, key: "E1" };
  expect(dependencies).toContainEqual({ kind: "membership" });
  expect(sources).toContainEqual(source);
  expect(messages.at(-1)).toMatchObject({
    role: "tool",
    name: preview.name,
    result: { ...rejected, phase: "execution" },
    citations: [source],
  });
  const committed = await database.client.query("select name from organizations where id = $1", [
    workspace,
  ]);
  expect(committed.rows).toEqual([{ name: original }]);
});
