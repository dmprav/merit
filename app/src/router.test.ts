import { expect, it, vi } from "vite-plus/test";

import { getRouter } from "./router";

vi.mock("./routeTree.gen", async () => {
  const { createRootRoute } = await import("@tanstack/react-router");
  return { routeTree: createRootRoute() };
});

it("keeps private query data isolated between server-rendered requests", () => {
  const first = getRouter();
  const second = getRouter();
  const firstCache = first.options.context!.queryClient;
  const secondCache = second.options.context!.queryClient;
  const key = ["private", "workspace", "alder"];

  firstCache.setQueryData(key, { title: "Confidential round" });

  expect(firstCache).not.toBe(secondCache);
  expect(secondCache.getQueryData(key)).toBeUndefined();
  firstCache.clear();
  secondCache.clear();
});
