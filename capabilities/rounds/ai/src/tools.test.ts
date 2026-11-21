import { assert, expect, it, vi } from "vite-plus/test";

import type { RoundsService } from "@merit/rounds/api";

import { createRoundTools } from "./tools";

it("returns a round creation receipt to the signed-in caller", async () => {
  const actor = { userId: "manager" };
  const roundId = "b8q3w5j7c2df";
  const input = {
    workspaceSlug: "alder",
    requestId: crypto.randomUUID(),
    title: "Community grants",
    budget: "2000.50",
  };

  const createRound: RoundsService["createRound"] = async (caller, command) =>
    caller.userId === actor.userId &&
    command.workspaceSlug === input.workspaceSlug &&
    command.requestId === input.requestId &&
    command.title === input.title &&
    command.budget === input.budget
      ? { status: "ok", publicId: roundId }
      : { status: "not_found" };

  const tools = createRoundTools(actor, { createRound, editRound: vi.fn(), deleteRound: vi.fn() });
  const create = tools.find((tool) => tool.name === "create_funding_round");
  assert(create);
  expect(await create.execute(input)).toEqual({ status: "ok", roundId });
});
