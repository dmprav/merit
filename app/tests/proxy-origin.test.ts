import { afterEach, expect, it, vi } from "vite-plus/test";

import { startInstance } from "../src/start";

afterEach(() => vi.unstubAllEnvs());

it.each([
  [
    { Origin: "https://grants.example" },
    "https://grants.example",
    "http://upstream.internal/",
    200,
  ],
  [
    { Referer: "https://grants.example/app" },
    "https://grants.example",
    "http://upstream.internal/",
    200,
  ],
  [
    { Origin: "http://upstream.internal" },
    "https://grants.example",
    "http://upstream.internal/",
    403,
  ],
  [{}, "https://grants.example", "http://upstream.internal/", 403],
  [{ Origin: "http://127.0.0.1:4000" }, undefined, "http://127.0.0.1:4000/", 200],
  [{ Origin: "http://localhost:4000" }, undefined, "http://127.0.0.1:4000/", 403],
] as const)(
  "checks fallback browser metadata against the configured public origin (%j)",
  async (headers, origin, url, status) => {
    vi.stubEnv("APP_ORIGIN", origin);
    const { requestMiddleware } = await startInstance.getOptions();
    const response = await requestMiddleware![0]!.options.server!({
      handlerType: "serverFn",
      request: new Request(url, {
        headers: new Headers(headers as HeadersInit),
      }),
      next: () => new Response("accepted"),
    } as never);
    expect(response).toHaveProperty("status", status);
  },
);
