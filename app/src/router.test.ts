import { expect, it, vi } from "vite-plus/test";

import { requestAccess } from "./access-request.functions";
import { getRouter } from "./router";

vi.mock("@tanstack/react-start", () => ({
  getGlobalStartContext: () => ({ nonce: "request-nonce" }),
}));

vi.mock("./access-request.functions", () => ({ requestAccess: vi.fn() }));

vi.mock("./routeTree.gen", async () => {
  const { createRootRoute } = await import("@tanstack/react-router");
  return { routeTree: createRootRoute() };
});

it("keeps private query data isolated between server-rendered requests", () => {
  const first = getRouter();
  const second = getRouter();
  expect(first.options.ssr?.nonce).toBe("request-nonce");
  const firstCache = first.options.context!.queryClient;
  const secondCache = second.options.context!.queryClient;
  const key = ["private", "workspace", "alder"];

  firstCache.setQueryData(key, { title: "Confidential round" });

  expect(firstCache).not.toBe(secondCache);
  expect(secondCache.getQueryData(key)).toBeUndefined();
  firstCache.clear();
  secondCache.clear();
});

it("submits access requests through the router context", async () => {
  vi.mocked(requestAccess).mockResolvedValue({ status: "limited" });
  const { context } = getRouter().options;
  const data = { email: "visitor@example.test" };
  await expect(context!.requestAccess(data)).resolves.toEqual({ status: "limited" });
  expect(requestAccess).toHaveBeenCalledWith({ data });
});
