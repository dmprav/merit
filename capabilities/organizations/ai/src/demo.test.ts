import { assert, expect, it, vi } from "vite-plus/test";

import { createDemoTools } from "./demo";

it("preserves recovery details when TanStack validates a demo failure", () => {
  const tools = createDemoTools({ userId: "manager" }, { start: vi.fn() });
  const demo = tools.find(({ name }) => name === "start_demo");
  assert(demo);
  const failure = {
    status: "unavailable",
    message: "Read the current state before retrying.",
    diagnosticId: crypto.randomUUID(),
  };
  expect(demo.outputSchema.parse(failure)).toEqual(failure);
  expect(demo.outputSchema.parse({ status: "unavailable" })).toEqual({ status: "unavailable" });
});
