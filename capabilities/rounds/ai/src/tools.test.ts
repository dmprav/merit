import { assert, expect, it, vi } from "vite-plus/test";

import type { RoundsService } from "@merit/rounds/api";

import { createRoundTools } from "./tools";

it("returns a round creation receipt to the signed-in caller", async () => {
  const actor = { userId: "manager" };
  const roundId = "b8q3w5j7c2df";
  const createRound = vi
    .fn<RoundsService["createRound"]>()
    .mockResolvedValue({ status: "ok", publicId: roundId });
  const tools = createRoundTools(actor, { createRound, editRound: vi.fn(), deleteRound: vi.fn() });
  const create = tools.find((tool) => tool.name === "create_funding_round");
  assert(create);
  const input = {
    workspaceSlug: "alder",
    requestId: crypto.randomUUID(),
    title: "Community grants",
    budget: "2000.50",
  };
  expect(await create.execute(input)).toEqual({ status: "ok", roundId });
  expect(createRound).toHaveBeenCalledWith(actor, input);
});
