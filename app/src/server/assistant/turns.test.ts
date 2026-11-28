import { assert, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type { Transaction } from "@merit/db";
import type { AssistantPreview, AssistantReceipt } from "@merit/mcp/assistant";

import type { Stored, TurnDependencies } from "./access.server";
import { createOpenAiAssistantModel, type AssistantDecision } from "./openai.server";
import { conversationState } from "./state";
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
  // How many conversation locks are open: a slow tool must run while this is zero.
  const locks = { open: 0 };
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
      locks.open++;
      try {
        return await store.save(
          user,
          slug,
          id,
          revision,
          await operation(tx, structuredClone(row)),
        );
      } finally {
        locks.open--;
      }
    },
  };
  const catalog = {
    list: async () =>
      ["find", "inspect", "invite", "run_ai_review", "get_reviewer_assignment"].map((name) => ({
        name,
        description: name,
        inputSchema: {},
        write: name === "invite" || name === "run_ai_review",
      })),
    permits: vi.fn<ReturnType<TurnDependencies["catalog"]>["permits"]>(async () => true),
    read: vi.fn<ReturnType<TurnDependencies["catalog"]>["read"]>(async () => ok),
    preview: vi.fn<ReturnType<TurnDependencies["catalog"]>["preview"]>(async (name, input) => ({
      ...ok,
      preview: proposal(name, input),
    })),
    execute: vi.fn<ReturnType<TurnDependencies["catalog"]>["execute"]>(async () => ok),
    recover: vi.fn<ReturnType<TurnDependencies["catalog"]>["recover"]>(async () => undefined),
    deliver: vi.fn<ReturnType<TurnDependencies["catalog"]>["deliver"]>(async () => "sent"),
    retryDelivery: vi.fn<ReturnType<TurnDependencies["catalog"]>["retryDelivery"]>(async () => {}),
  };
  const model = vi.fn<TurnDependencies["model"]>(async () => answer("Done."));
  const create = vi.fn<TurnDependencies["catalog"]>(() => catalog);
  const turns = createAssistantTurns({ store, model, catalog: create });
  await turns.create(actor, "workspace");
  await turns.start(...address, {
    message: "What needs attention?",
    page: "/workspace/applications",
  });
  return {
    turns,
    catalog,
    create,
    locks,
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

it("discards a model response arriving after Stop, and aborts the request when the activity is cancelled", async () => {
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
  const cancellation = new AbortController();
  const running = ctx.turns.advance(...address, cancellation.signal);
  await started;
  await ctx.turns.stop(...address);
  // Stop runs in the web process, which holds no model request. The conversation's workflow
  // cancels the worker's activity instead, and its cancellation signal aborts the request.
  expect(ctx.model.mock.calls[0]?.[3]?.aborted).toBe(false);
  cancellation.abort();
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
  const final = ctx.model.mock.calls.at(-1);
  assert.isDefined(final);
  expect(final[0]).toContainEqual(
    expect.objectContaining({
      name: "invite",
      input: { to: "one" },
      result: { status: "failed", phase: "execution" },
    }),
  );
  expect(final[1].map((tool) => tool.name)).toEqual(["read_observation"]);
  expect(ctx.catalog.preview).toHaveBeenCalledTimes(2);
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

it("asks for missing information after inspecting records without inventing a claim", async () => {
  const ctx = await fixture();
  ctx.catalog.read.mockResolvedValueOnce({
    ...ok,
    citations: [{ kind: "submission", recordId: "A", version: "1", label: "Report" }],
  });
  ctx.model
    .mockResolvedValueOnce(calls("inspect", "A"))
    .mockResolvedValueOnce({ kind: "clarification", text: "Which committee meeting do you mean?" });
  await ctx.run();
  expect((await ctx.open())?.messages.at(-1)).toMatchObject({
    role: "assistant",
    text: "Which committee meeting do you mean?",
    citations: [],
  });
});

it("previews follow-on work after its own prerequisite succeeds despite an unrelated failure", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce({
    kind: "calls",
    calls: [
      { name: "invite", input: { to: "A" } },
      { name: "invite", input: { to: "B" } },
      { name: "invite", input: { to: "after A" }, dependsOn: [0] },
      { name: "invite", input: { to: "after B" }, dependsOn: [1] },
    ],
  });
  ctx.catalog.execute
    .mockResolvedValueOnce(ok)
    .mockResolvedValueOnce({ ...ok, result: { status: "invalid" } });
  await ctx.run();
  const first = (await ctx.open())?.groups[0];
  assert.isDefined(first);
  await ctx.turns.approve(...address, { previewId: first.id });
  await ctx.run();
  const chat = await ctx.open();
  expect(chat?.status).toBe("awaiting_approval");
  const second = chat?.groups[1];
  assert.isDefined(second);
  expect(second.actions.map((item) => item.preview.input.to)).toEqual(["after A"]);
  expect(chat?.progress.some((item) => item.status === "blocked")).toBe(true);
  expect(ctx.catalog.execute).toHaveBeenCalledTimes(2);
  await ctx.turns.approve(...address, { previewId: second.id });
  await ctx.run();
  expect((await ctx.open())?.status).toBe("completed");
  expect(ctx.catalog.execute.mock.calls.map(([item]) => item.input.to)).toEqual([
    "A",
    "B",
    "after A",
  ]);
});

it.each(["failed", "declined"] as const)(
  "answers from independent deferred reads when another action is %s",
  async (outcome) => {
    const ctx = await fixture();
    ctx.model
      .mockResolvedValueOnce({
        kind: "calls",
        calls: [
          { name: "invite", input: { to: "A" } },
          { name: "invite", input: { to: "B" } },
          { name: "inspect", input: { to: "A" }, dependsOn: [0] },
          { name: "inspect", input: { to: "B" }, dependsOn: [1] },
        ],
      })
      .mockResolvedValueOnce(calls("invite", "A"))
      .mockResolvedValueOnce(answer("B's assessment is ready [E1]."));
    ctx.catalog.execute.mockResolvedValueOnce({
      ...ok,
      result: { status: outcome === "declined" ? "stale" : "invalid" },
    });
    ctx.catalog.read.mockResolvedValue({
      ...ok,
      citations: [{ kind: "assessment", recordId: "B", version: "1", label: "Assessment" }],
    });
    await ctx.run();
    const group = (await ctx.open())?.groups[0];
    assert.isDefined(group);
    await ctx.turns.approve(...address, { previewId: group.id });
    await ctx.run();
    if (outcome === "declined") {
      const replacement = (await ctx.open())?.groups[1];
      assert.isDefined(replacement);
      await ctx.turns.decline(...address, { previewId: replacement.id });
      await ctx.run();
    }
    const chat = await ctx.open();
    expect(ctx.catalog.read.mock.calls).toEqual([["inspect", { to: "B" }]]);
    expect(chat?.progress).toContainEqual(
      expect.objectContaining({ name: "inspect", status: "blocked" }),
    );
    expect(chat?.status).toBe("completed");
    expect(chat?.messages.at(-1)).toMatchObject({ text: "B's assessment is ready [E1]." });
    expect(chat?.groups.flatMap(({ actions }) => actions.map(({ status }) => status))).toEqual(
      outcome === "failed" ? ["failed", "succeeded"] : ["stale", "succeeded", "declined"],
    );
    expect(ctx.catalog.execute).toHaveBeenCalledTimes(2);
  },
);

it("returns the saved observations for a citation until access to the chat is lost", async () => {
  const ctx = await fixture();
  const citations = [{ kind: "submission", recordId: "A", version: "2", label: "Report" }];
  ctx.catalog.read
    .mockResolvedValueOnce({ ...ok, result: { status: "ok", summary: "Original" }, citations })
    .mockResolvedValueOnce({
      ...ok,
      result: { status: "ok", title: "Submission details" },
      citations,
    });
  ctx.model
    .mockResolvedValueOnce(calls("find", "A"))
    .mockResolvedValueOnce(calls("inspect", "A"))
    .mockResolvedValueOnce(answer("Report [E1]."));
  await ctx.run();
  await ctx.open();
  expect(await ctx.turns.evidence(...address, "E1")).toMatchObject({
    citation: { recordId: "A", version: "2" },
    observations: [
      { name: "find", result: { summary: "Original" } },
      { name: "inspect", result: { title: "Submission details" } },
    ],
  });
  expect(await ctx.turns.evidence(...address, "E9")).toBeNull();
  ctx.catalog.permits.mockResolvedValue(false);
  expect(await ctx.turns.evidence(...address, "E1")).toBeNull();
});

it("keeps an invitation delivering while its message is pending and records the outcome once it settles", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "only"));
  ctx.catalog.execute.mockImplementation(async () => ({
    ...ok,
    delivery: { assignmentId: "assignment", kind: "invitation", messageId: "only" },
  }));
  ctx.catalog.deliver
    .mockResolvedValueOnce("pending")
    .mockResolvedValueOnce("pending")
    .mockResolvedValue("failed");
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });

  // Each step only asks where the message stands; none waits for it or records an outcome.
  expect(await ctx.turns.advance(...address)).toBe("progressed");
  expect(await ctx.turns.advance(...address)).toBe("waiting");
  expect(await ctx.turns.advance(...address)).toBe("waiting");
  expect((await ctx.open())?.groups[0]?.actions.map((item) => item.status)).toEqual(["delivering"]);

  expect(await ctx.turns.advance(...address)).toBe("progressed");
  expect((await ctx.open())?.groups[0]?.actions.map((item) => item.status)).toEqual(["failed"]);
  expect(ctx.catalog.deliver).toHaveBeenCalledTimes(3);
  // One message, one delivery path: the outcome was recorded once, with no second execution.
  expect(ctx.catalog.execute).toHaveBeenCalledTimes(1);
});

it("records a delivery that settles after Stop, and does nothing else for the stopped chat", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "first", "second"));
  ctx.catalog.execute.mockImplementation(async (preview) => ({
    ...ok,
    delivery: { kind: "invitation", assignmentId: "A", messageId: String(preview.input.to) },
  }));
  ctx.catalog.deliver.mockResolvedValueOnce("pending").mockResolvedValue("sent");
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });
  await ctx.run();
  expect((await ctx.open())?.groups[0]?.actions.map((item) => item.status)).toEqual([
    "delivering",
    "approved",
  ]);

  await ctx.turns.stop(...address);
  const stopped = await ctx.open();
  expect(stopped?.status).toBe("stopped");
  expect(stopped?.groups[0]?.actions.map((item) => item.status)).toEqual(["stopped", "stopped"]);

  expect(await ctx.turns.advance(...address)).toBe("progressed");
  const chat = await ctx.open();
  expect(chat?.status).toBe("stopped");
  expect(chat?.groups[0]?.actions.map((item) => item.status)).toEqual(["succeeded", "stopped"]);
  // Nothing more to settle: the stopped chat is finished, and no model or action ran.
  expect(await ctx.turns.advance(...address)).toBe("finished");
  expect(ctx.catalog.deliver).toHaveBeenCalledTimes(2);
  expect(ctx.catalog.execute).toHaveBeenCalledTimes(1);
  expect(ctx.model).toHaveBeenCalledTimes(1);
});

it("settles a delivery Stop left unconfirmed after a new turn starts, without resuming it or changing the new turn", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "only"));
  ctx.catalog.execute.mockImplementation(async () => ({
    ...ok,
    delivery: { kind: "invitation", assignmentId: "A", messageId: "only" },
  }));
  ctx.catalog.deliver.mockResolvedValueOnce("pending").mockResolvedValue("failed");
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });
  await ctx.run();
  await ctx.turns.stop(...address);
  await ctx.turns.start(...address, { message: "Anything else?" });
  expect((await ctx.open())?.status).toBe("running");

  expect(await ctx.turns.advance(...address)).toBe("progressed");
  const chat = await ctx.open();
  expect(chat?.status).toBe("running");
  expect(chat?.groups[0]?.actions[0]).toMatchObject({ status: "failed", canRetry: true });
  expect(ctx.catalog.execute).toHaveBeenCalledTimes(1);
  expect(ctx.model).toHaveBeenCalledTimes(1);
});

it("keeps settling an unconfirmed delivery after the new turn completes", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "only")).mockResolvedValueOnce(answer("Done."));
  ctx.catalog.execute.mockImplementation(async () => ({
    ...ok,
    delivery: { kind: "invitation", assignmentId: "A", messageId: "only" },
  }));
  ctx.catalog.deliver.mockResolvedValue("pending");
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });
  await ctx.run();
  await ctx.turns.stop(...address);
  await ctx.turns.start(...address, { message: "Anything else?" });
  expect(await ctx.turns.advance(...address)).toBe("progressed");
  expect((await ctx.open())?.status).toBe("completed");
  // The conversation is done, but the email is not accounted for: it waits instead of finishing.
  expect(await ctx.turns.advance(...address)).toBe("waiting");
  ctx.catalog.deliver.mockResolvedValue("sent");
  expect(await ctx.turns.advance(...address)).toBe("progressed");
  const chat = await ctx.open();
  expect(chat?.status).toBe("completed");
  expect(chat?.groups[0]?.actions[0]?.status).toBe("succeeded");
  expect(await ctx.turns.advance(...address)).toBe("finished");
});

it("advances the new turn from the saved chat when settling a stopped delivery only saved a read error", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "only")).mockResolvedValueOnce(answer("Done."));
  ctx.catalog.execute.mockImplementation(async () => ({
    ...ok,
    delivery: { kind: "invitation", assignmentId: "A", messageId: "only" },
  }));
  ctx.catalog.deliver.mockResolvedValueOnce("pending").mockRejectedValue(new Error("down"));
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });
  await ctx.run();
  await ctx.turns.stop(...address);
  await ctx.turns.start(...address, { message: "Anything else?" });

  // The failed read writes its count, and the same step still runs the new turn.
  expect(await ctx.turns.advance(...address)).toBe("progressed");
  expect((await ctx.open())?.status).toBe("completed");
  expect(ctx.model).toHaveBeenCalledTimes(2);
});

it("records a failed delivery after Stop so the invitation can be retried from the chat", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "only"));
  ctx.catalog.execute.mockImplementation(async () => ({
    ...ok,
    delivery: { kind: "invitation", assignmentId: "A", messageId: "only" },
  }));
  ctx.catalog.deliver.mockResolvedValueOnce("pending").mockResolvedValue("failed");
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });
  await ctx.run();
  await ctx.turns.stop(...address);
  expect(await ctx.turns.advance(...address)).toBe("progressed");
  const action = (await ctx.open())?.groups[0]?.actions[0];
  expect(action).toMatchObject({ status: "failed", canRetry: true });
});

it("records a failed delivery when its message cannot be read repeatedly, without writing while it waits", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "only"));
  ctx.catalog.execute.mockImplementation(async () => ({
    ...ok,
    delivery: { kind: "invitation", assignmentId: "A", messageId: "only" },
  }));
  ctx.catalog.deliver.mockResolvedValueOnce("pending").mockRejectedValue(new Error("down"));
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });
  await ctx.run();
  for (let attempt = 0; attempt < 9; attempt++) {
    expect(await ctx.turns.advance(...address)).toBe("waiting");
  }
  expect((await ctx.open())?.groups[0]?.actions[0]?.status).toBe("delivering");
  expect(await ctx.turns.advance(...address)).toBe("progressed");
  expect((await ctx.open())?.groups[0]?.actions[0]).toMatchObject({
    status: "failed",
    canRetry: true,
  });
});

it("counts only consecutive read errors toward giving up on a delivery", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "only"));
  ctx.catalog.execute.mockImplementation(async () => ({
    ...ok,
    delivery: { kind: "invitation", assignmentId: "A", messageId: "only" },
  }));
  ctx.catalog.deliver.mockResolvedValueOnce("pending").mockRejectedValue(new Error("down"));
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });
  await ctx.run();
  for (let attempt = 0; attempt < 9; attempt++) {
    expect(await ctx.turns.advance(...address)).toBe("waiting");
  }
  // A successful read in between starts the count again.
  ctx.catalog.deliver
    .mockReset()
    .mockResolvedValueOnce("pending")
    .mockRejectedValue(new Error("down"));
  expect(await ctx.turns.advance(...address)).toBe("waiting");
  for (let attempt = 0; attempt < 9; attempt++) {
    expect(await ctx.turns.advance(...address)).toBe("waiting");
  }
  expect((await ctx.open())?.groups[0]?.actions[0]?.status).toBe("delivering");
  expect(await ctx.turns.advance(...address)).toBe("progressed");
  expect((await ctx.open())?.groups[0]?.actions[0]?.status).toBe("failed");
});

it("does not write the chat while a delivery is still pending", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("invite", "only"));
  ctx.catalog.execute.mockImplementation(async () => ({
    ...ok,
    delivery: { kind: "invitation", assignmentId: "A", messageId: "only" },
  }));
  ctx.catalog.deliver.mockResolvedValue("pending");
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });
  await ctx.run();
  const before = await ctx.open();
  expect(before?.revision).toBeTypeOf("number");
  expect(await ctx.turns.advance(...address)).toBe("waiting");
  expect(await ctx.turns.advance(...address)).toBe("waiting");
  expect((await ctx.open())?.revision).toBe(before?.revision);
});

it("pages a large saved private draft through provider calls and cites the original observation", async () => {
  const ctx = await fixture();
  const conclusion = "The matching grant was withdrawn.";
  ctx.catalog.read.mockResolvedValueOnce({
    ...ok,
    result: {
      status: "ok",
      draft: { reasoning: "a".repeat(4250) + conclusion + "b".repeat(35000) },
    },
    citations: [{ kind: "observation", recordId: "assignment", label: "Review", version: "v3" }],
  });

  const toolCall = (name: string, input: Record<string, unknown>) =>
    Response.json({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: null,
            tool_calls: [
              { type: "function", function: { name, arguments: JSON.stringify({ input }) } },
            ],
          },
        },
      ],
    });

  const lastResult = (request?: RequestInit) => {
    assert(typeof request?.body === "string");
    expect(Buffer.byteLength(request.body)).toBeLessThan(32 * 1024);
    const body = z
      .object({
        messages: z.array(z.object({ content: z.string().nullable() })),
        tools: z.array(z.object({ function: z.object({ name: z.string() }) })),
      })
      .parse(JSON.parse(request.body));
    expect(body.tools.map((tool) => tool.function.name)).toContain("read_observation");
    const content = body.messages.at(-1)?.content;
    assert(typeof content === "string");
    return z
      .object({
        result: z.object({
          observation: z.number(),
          text: z.string().optional(),
          nextCursor: z.number().nullable().optional(),
        }),
        evidence: z.array(z.string()),
      })
      .parse(JSON.parse(content));
  };

  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected provider request"))
    .mockResolvedValueOnce(toolCall("get_reviewer_assignment", { assignmentId: "assignment" }))
    .mockImplementationOnce(async (_url, request) => {
      const { result } = lastResult(request);
      return toolCall("read_observation", {
        observation: result.observation,
        section: "result",
        cursor: 0,
      });
    })
    .mockImplementationOnce(async (_url, request) => {
      const { result } = lastResult(request);
      expect(result.text).toContain("reasoning");
      expect(result.text).not.toContain(conclusion);
      return toolCall("read_observation", {
        observation: result.observation,
        section: "result",
        cursor: result.nextCursor,
      });
    })
    .mockImplementationOnce(async (_url, request) => {
      const { result, evidence } = lastResult(request);
      expect(result.text).toContain(conclusion);
      return Response.json({
        choices: [
          { finish_reason: "stop", message: { content: conclusion + " [" + evidence[0] + "]" } },
        ],
      });
    });
  try {
    ctx.model.mockImplementation(
      createOpenAiAssistantModel({ apiKey: "test-only", model: "merit-test" }),
    );
    await ctx.run();
    expect(await ctx.open()).toMatchObject({
      status: "completed",
      messages: [{ role: "user" }, { text: conclusion + " [E1]", citations: [{ version: "v3" }] }],
    });
    expect(ctx.catalog.read).toHaveBeenCalledTimes(1);
  } finally {
    fetch.mockRestore();
  }
});

it("rechecks access before using a saved observation for the next model request", async () => {
  const ctx = await fixture();
  ctx.model
    .mockResolvedValueOnce(calls("inspect", "assignment"))
    .mockImplementationOnce(async () => {
      ctx.catalog.permits.mockImplementation(
        async (deps) => !deps.some((dep) => dep.kind === "grants"),
      );
      return {
        kind: "calls",
        calls: [
          { name: "read_observation", input: { observation: 1, section: "result", cursor: 0 } },
        ],
      };
    });
  await ctx.run();
  expect(ctx.model).toHaveBeenCalledTimes(2);
  expect(await ctx.open()).toBeNull();
  expect(await ctx.store.read(...address)).toMatchObject({
    status: "unavailable",
    state: { messages: [{ role: "user" }, { role: "tool", name: "inspect" }] },
  });
});

const slowReview = async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("run_ai_review", "application"));
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });

  let finish: (receipt: AssistantReceipt) => void = () => {};

  let announce = () => {};

  const started = new Promise<void>((resolve) => {
    announce = resolve;
  });
  const held: { locks?: number; open?: unknown } = {};
  ctx.catalog.execute.mockImplementationOnce(async () => {
    held.locks = ctx.locks.open;
    held.open = await ctx.open();
    announce();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  return { ...ctx, group, started, held, finish: (receipt: AssistantReceipt) => finish(receipt) };
};

it("runs an approved slow tool with no conversation lock, and keeps the conversation readable and stoppable meanwhile", async () => {
  const ctx = await slowReview();
  const cancellation = new AbortController();
  const running = ctx.turns.advance(...address, cancellation.signal);
  await ctx.started;
  expect(ctx.held.locks).toBe(0);
  expect(ctx.held.open).toMatchObject({
    status: "running",
    groups: [{ actions: [{ status: "approved" }] }],
  });
  // The model request of the run is aborted by Stop's cancellation, never by a lock.
  const run = ctx.create.mock.calls.find((call) => call[3]);
  expect(run?.[2]).toBeUndefined();
  const signal = run?.[3];
  expect(signal?.aborted).toBe(false);
  cancellation.abort();
  expect(signal?.aborted).toBe(true);
  ctx.finish(ok);
  await running;
  expect(await ctx.open()).toMatchObject({
    status: "running",
    groups: [{ actions: [{ status: "succeeded" }] }],
  });
  expect(ctx.catalog.execute).toHaveBeenCalledTimes(1);
});

it("leaves a live claim to the worker that holds it", async () => {
  const ctx = await slowReview();
  const running = ctx.turns.advance(...address);
  await ctx.started;
  expect(await ctx.turns.advance(...address)).toBe("waiting");
  expect(ctx.catalog.execute).toHaveBeenCalledTimes(1);
  ctx.finish(ok);
  await running;
  expect((await ctx.open())?.groups[0]?.actions[0]?.status).toBe("succeeded");
});

it("stops a slow run that saved nothing, and reports a review that committed before Stop as succeeded", async () => {
  const saved = await slowReview();
  const savedRun = saved.turns.advance(...address);
  await saved.started;
  await saved.turns.stop(...address);
  saved.finish({ ...ok, result: { status: "failed" } });
  await savedRun;
  expect(await saved.open()).toMatchObject({
    status: "stopped",
    groups: [{ actions: [{ status: "stopped", canRetry: false }] }],
  });

  const committed = await slowReview();
  const committedRun = committed.turns.advance(...address);
  await committed.started;
  await committed.turns.stop(...address);
  committed.finish(ok);
  await committedRun;
  const view = await committed.open();
  expect(view).toMatchObject({
    status: "stopped",
    groups: [{ actions: [{ status: "succeeded", canRetry: false }] }],
  });
  const action = view?.groups[0]?.actions[0];
  assert.isDefined(action);
  await expect(
    committed.turns.retry(...address, { previewId: committed.group.id, actionId: action.id }),
  ).rejects.toThrow(AssistantTurnConflict);
});

it("reports an expired claim as a failed action that is retried only by approval, never run again", async () => {
  const ctx = await fixture();
  ctx.model.mockResolvedValueOnce(calls("run_ai_review", "application"));
  await ctx.run();
  const group = (await ctx.open())?.groups[0];
  assert.isDefined(group);
  await ctx.turns.approve(...address, { previewId: group.id });
  // A worker claimed the run and died: its claim has passed with no outcome.
  const stored = await ctx.store.read(...address);
  assert.isNotNull(stored);
  const state = conversationState.parse(stored.state);
  const claimed = state.groups[0]?.actions[0];
  assert.isDefined(claimed);
  claimed.executing = { id: "dead", until: 0 };
  assert.isNotNull(await ctx.store.save(...address, stored.revision, { status: "running", state }));

  await ctx.run();
  expect(ctx.catalog.execute).not.toHaveBeenCalled();
  const failed = (await ctx.open())?.groups[0]?.actions[0];
  expect(failed).toMatchObject({ status: "failed", canRetry: true });
  assert.isDefined(failed);
  await ctx.turns.retry(...address, { previewId: group.id, actionId: failed.id });
  const retried = (await ctx.open())?.groups[1];
  assert.isDefined(retried);
  await ctx.turns.approve(...address, { previewId: retried.id });
  await ctx.run();
  expect(ctx.catalog.execute).toHaveBeenCalledTimes(1);
  expect((await ctx.open())?.groups.map((item) => item.actions[0]?.status)).toEqual([
    "failed",
    "succeeded",
  ]);
});
