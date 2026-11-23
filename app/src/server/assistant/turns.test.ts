import { assert, expect, it, vi } from "vite-plus/test";

import type { Transaction } from "@merit/db";
import type { AssistantPreview, AssistantReceipt } from "@merit/mcp/assistant";

import type { Stored, TurnDependencies } from "./access.server";
import type { AssistantDecision } from "./openai.server";
import { AssistantTurnConflict, createAssistantTurns } from "./turns.server";

const actor = { userId: "manager" };
const address = [actor, "workspace", "chat"] as const;
const ok: AssistantReceipt = {
  result: { status: "ok" },
  dependencies: [{ kind: "grants" }],
  citations: [],
};

const proposal = (name: string, input: Record<string, unknown>): AssistantPreview => ({
  name,
  input,
  targets: [{ kind: "reviewer", id: String(input.to), label: String(input.to), version: "r1" }],
  effects: [`Email ${String(input.to)}`],
});

const calls = (name: string, ...recipients: string[]): AssistantDecision => ({
  kind: "calls",
  calls: recipients.map((to) => ({ name, input: { to } })),
});

const answer = (text: string): AssistantDecision => ({ kind: "answer", text });

const fixture = async () => {
  let row: Stored | null = null;
  const tx = {
    transaction: async <T>(work: (tx: Transaction) => Promise<T>) => work({} as Transaction),
  } as Transaction;
  const store: TurnDependencies["store"] = {
    getConsent: vi.fn(async () => true),
    create: async (_, workspaceSlug, initial) => {
      row = {
        id: "chat",
        workspaceSlug,
        revision: 0,
        status: "idle",
        state: {},
        createdAt: "",
        updatedAt: "",
        ...initial,
      };
      return row;
    },
    list: async () => (row ? [structuredClone(row)] : []),
    read: async () => structuredClone(row),
    remove: async () => {
      row = null;
      return true;
    },
    save: async (_actor, _slug, _id, revision, checkpoint) => {
      if (!row || row.revision !== revision) {
        return null;
      }
      row = { ...row, ...structuredClone(checkpoint), revision: revision + 1 };
      return structuredClone(row);
    },
    runLocked: async (user, slug, id, revision, operation) => {
      if (!row || row.revision !== revision || !(await store.getConsent(user, slug))) {
        return null;
      }
      return store.save(user, slug, id, revision, await operation(tx, structuredClone(row)));
    },
  };
  const catalog = {
    list: async () =>
      ["find", "inspect", "invite"].map((name) => ({
        name,
        description: name,
        inputSchema: {},
        write: name === "invite",
      })),
    permits: vi.fn<ReturnType<TurnDependencies["catalog"]>["permits"]>(async () => true),
    read: vi.fn<ReturnType<TurnDependencies["catalog"]>["read"]>(async () => ok),
    preview: vi.fn<ReturnType<TurnDependencies["catalog"]>["preview"]>(async (name, input) => ({
      ...ok,
      preview: proposal(name, input),
    })),
    execute: vi.fn<ReturnType<TurnDependencies["catalog"]>["execute"]>(async () => ok),
    deliver: vi.fn<ReturnType<TurnDependencies["catalog"]>["deliver"]>(async () => "sent"),
  };
  const model = vi.fn<TurnDependencies["model"]>(async () => answer("Done."));
  const turns = createAssistantTurns({ store, model, catalog: () => catalog });
  await turns.create(actor, "workspace");
  await turns.start(...address, {
    message: "What needs attention?",
    page: "/workspace/applications",
  });
  return {
    turns,
    catalog,
    model,
    store,
    run: () => turns.run(...address),
    open: () => turns.open(...address),
  };
};

it("follows evidence across reads, repairs invalid citations and retains the versions behind the answer", async () => {
  const ctx = await fixture();
  ctx.catalog.read
    .mockResolvedValueOnce({ ...ok, result: { status: "ok", applicationId: "A" } })
    .mockResolvedValueOnce({
      ...ok,
      citations: [{ kind: "submission", recordId: "A", version: "3", label: "Report" }],
    });
  ctx.model
    .mockResolvedValueOnce(calls("find", "round"))
    .mockImplementationOnce(async (history) => {
      expect(history.at(-1)).toMatchObject({ role: "tool", result: { applicationId: "A" } });
      return calls("inspect", "A");
    })
    .mockResolvedValueOnce(answer("The report needs attention [E9]."))
    .mockResolvedValueOnce(answer("The report needs attention [E1]."));
  await ctx.run();
  expect(await ctx.open()).toMatchObject({
    status: "completed",
    messages: [
      { role: "user" },
      { role: "assistant", citations: [{ recordId: "A", version: "3", key: "E1" }] },
    ],
  });
});

it("continues independent invitations and retries only a failed email after reopening", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "first", "second", "third"));
  ctx.catalog.execute.mockImplementation(async (preview) => ({
    ...ok,
    delivery: {
      assignmentId: "assignment",
      kind: "invitation",
      messageId: String(preview.input.to),
    },
  }));
  ctx.catalog.deliver
    .mockResolvedValueOnce("sent")
    .mockResolvedValueOnce("failed")
    .mockResolvedValue("sent");
  await ctx.run();
  const preview = (await ctx.open())?.groups[0];
  assert.isDefined(preview);
  expect(preview.actions.map((action) => action.preview.effects)).toEqual([
    ["Email first"],
    ["Email second"],
    ["Email third"],
  ]);
  expect(ctx.catalog.execute).not.toHaveBeenCalled();
  await expect(ctx.turns.approve(...address, { previewId: "old" })).rejects.toThrow(
    AssistantTurnConflict,
  );
  await ctx.turns.approve(...address, { previewId: preview.id });
  await ctx.run();
  const result = (await ctx.open())?.groups[0];
  expect(result?.actions.map((action) => action.status)).toEqual([
    "succeeded",
    "failed",
    "succeeded",
  ]);
  const second = result?.actions[1];
  assert.isDefined(second);
  await ctx.turns.retry(...address, { previewId: preview.id, actionId: second.id });
  await ctx.run();
  expect(ctx.catalog.execute).toHaveBeenCalledTimes(3);
  expect(ctx.catalog.deliver.mock.calls.map(([ticket]) => ticket.messageId)).toEqual([
    "first",
    "second",
    "third",
    "second",
  ]);
  expect((await ctx.open())?.groups[0]?.actions.every((item) => item.status === "succeeded")).toBe(
    true,
  );
});

it("requires a fresh approval after a revision changes", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "reviewer"));
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  ctx.catalog.execute.mockResolvedValueOnce({ ...ok, result: { status: "stale" } });
  ctx.catalog.preview.mockImplementationOnce(async (name, input) => ({
    ...ok,
    preview: {
      ...proposal(name, input),
      targets: [{ kind: "reviewer", id: "reviewer", label: "Changed", version: "r2" }],
    },
  }));
  await ctx.turns.approve(...address, { previewId: group.id });
  await ctx.run();
  expect(await ctx.open()).toMatchObject({
    status: "awaiting_approval",
    groups: [
      { actions: [{ status: "stale" }] },
      { actions: [{ status: "waiting", preview: { targets: [{ version: "r2" }] } }] },
    ],
  });
  await expect(ctx.turns.approve(...address, { previewId: group.id })).rejects.toThrow(
    AssistantTurnConflict,
  );
});

it("withholds the entire chat and pending approval after access to an uncited result is lost", async () => {
  const ctx = await fixture();
  ctx.model
    .mockResolvedValueOnce(calls("inspect", "note"))
    .mockResolvedValueOnce(calls("invite", "reviewer"));
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  ctx.catalog.permits.mockImplementation(
    async (deps) => !deps.some((dep) => dep.kind === "grants"),
  );
  expect(await ctx.turns.approve(...address, { previewId: group.id })).toBeNull();
  expect(await ctx.turns.list(actor, "workspace")).toEqual([]);
  ctx.catalog.permits.mockResolvedValue(true);
  expect(await ctx.open()).toBeNull();
  expect(ctx.catalog.execute).not.toHaveBeenCalled();
});

it("discards a model response arriving after Stop", async () => {
  const ctx = await fixture();

  let finish: (decision: AssistantDecision) => void = () => {};

  let announce = () => {};

  const started = new Promise<void>((resolve) => {
    announce = resolve;
  });
  ctx.model.mockImplementationOnce(() => {
    announce();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const running = ctx.run();
  await started;
  await ctx.turns.stop(...address);
  expect(ctx.model.mock.calls[0]?.[3]?.aborted).toBe(true);
  finish(calls("invite", "recipient"));
  await running;
  expect(await ctx.open()).toMatchObject({ status: "stopped", groups: [] });
  expect(ctx.catalog.preview).not.toHaveBeenCalled();
});

it("defers dependent calls and halts them when the prerequisite fails", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce({
    kind: "calls",
    calls: [
      { name: "invite", input: { to: "one" } },
      { name: "invite", input: { to: "dependent" }, dependsOn: [0] },
      { name: "invite", input: { to: "independent" } },
    ],
  });
  ctx.catalog.execute.mockRejectedValueOnce(new Error("rolled back"));
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  expect(group.actions.map((action) => action.preview.input.to)).toEqual(["one", "independent"]);
  await ctx.turns.approve(...address, { previewId: group.id });
  await ctx.run();
  expect((await ctx.open())?.groups[0]?.actions.map((action) => action.status)).toEqual([
    "failed",
    "succeeded",
  ]);
  expect(ctx.model).toHaveBeenCalledTimes(1);
});

it("prevents execution after deletion or withdrawal of provider consent", async () => {
  const ctx = await fixture();
  vi.mocked(ctx.store.getConsent).mockResolvedValue(false);
  await ctx.run();
  expect(ctx.model).not.toHaveBeenCalled();
  vi.mocked(ctx.store.getConsent).mockResolvedValue(true);
  ctx.model.mockResolvedValueOnce(calls("invite", "reviewer"));
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });
  vi.mocked(ctx.store.getConsent).mockResolvedValue(false);
  await ctx.run();
  expect(ctx.catalog.execute).not.toHaveBeenCalled();
  await ctx.turns.remove(...address);
  vi.mocked(ctx.store.getConsent).mockResolvedValue(true);
  await ctx.run();
  expect(await ctx.open()).toBeNull();
  expect(ctx.catalog.execute).not.toHaveBeenCalled();
});
