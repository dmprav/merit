import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const { pendingFlushes, mockEnv, handlerFetch } = vi.hoisted(() => ({
  pendingFlushes: [] as Promise<unknown>[],
  mockEnv: {
    HYPERDRIVE: { connectionString: "postgres://merit:merit@hyperdrive.local/merit" },
    CLERK_PUBLISHABLE_KEY: "pk_test",
    CLERK_SECRET_KEY: "sk_test",
    CLERK_ISSUER: "https://issuer.example",
    APP_ORIGIN: "https://merit.example",
    MERIT_OPERATOR_USER_IDS: "",
    EMAIL_FROM: "no-reply@merit.example",
    RESEND_API_KEY: "",
    MAILPIT_URL: "",
    OTEL_SERVICE_NAME: "merit-worker",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example",
    OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer test-secret",
    OTEL_TRACE_FILTER: "checkly",
  },
  handlerFetch: vi.fn(async () => new Response("ok", { status: 200 })),
}));

vi.mock("cloudflare:workers", () => ({
  waitUntil: (promise: Promise<unknown>) => {
    pendingFlushes.push(promise);
  },
  env: mockEnv,
}));

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: handlerFetch },
  createServerEntry: <T>(entry: T) => entry,
}));

vi.mock("@merit/mcp", () => ({
  mcpResourceMetadata: vi.fn(() => new Response("metadata", { status: 200 })),
  handleWorkspaceMcp: vi.fn(),
}));

import serverEntry from "../src/server";

const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));

beforeEach(() => {
  pendingFlushes.length = 0;
  handlerFetch.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("exports Checkly-sampled worker spans via OTLP/HTTP using Cloudflare waitUntil", async () => {
  const response = await serverEntry.fetch(
    new Request("https://merit.example/demo", {
      headers: {
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        tracestate: "checkly=true",
      },
    }),
    {} as never,
  );

  expect(response.status).toBe(200);
  expect(pendingFlushes).toHaveLength(1);
  await Promise.all(pendingFlushes);

  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://otlp.example/v1/traces");
  expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-secret");

  const rawBody =
    typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
  const payload = JSON.parse(rawBody) as {
    resourceSpans: Array<{
      resource: { attributes: Array<{ key: string; value: { stringValue?: string } }> };
      scopeSpans: Array<{
        spans: Array<{ traceId: string; name: string }>;
      }>;
    }>;
  };
  const serviceAttr = payload.resourceSpans[0]!.resource.attributes.find(
    (attr) => attr.key === "service.name",
  );
  expect(serviceAttr?.value.stringValue).toBe("merit-worker");
  expect(payload.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.traceId).toBe(
    "4bf92f3577b34da6a3ce929d0e0e4736",
  );
  expect(payload.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.name).toBe("HTTP GET /demo");
});

it("does not export spans when tracestate lacks the checkly marker under default filter", async () => {
  const response = await serverEntry.fetch(new Request("https://merit.example/demo"), {} as never);

  expect(response.status).toBe(200);
  await Promise.all(pendingFlushes);
  expect(fetchMock).not.toHaveBeenCalled();
});
