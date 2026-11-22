import { afterEach, expect, it, vi } from "vite-plus/test";

import { startInstance } from "../src/start";

afterEach(() => vi.unstubAllEnvs());

it.each([
  [{ Origin: "https://grants.example" }, 200],
  [{ Referer: "https://grants.example/app" }, 200],
  [{ Origin: "http://upstream.internal" }, 403],
  [{}, 403],
] as const)(
  "checks fallback browser metadata against the configured public origin (%j)",
  async (headers, status) => {
    vi.stubEnv("APP_ORIGIN", "https://grants.example");
    const { requestMiddleware } = await startInstance.getOptions();
    const response = await requestMiddleware![0]!.options.server!({
      handlerType: "serverFn",
      request: new Request("http://upstream.internal/", {
        headers: new Headers(headers as HeadersInit),
      }),
      next: () => new Response("accepted"),
    } as never);
    expect(response).toHaveProperty("status", status);
  },
);
