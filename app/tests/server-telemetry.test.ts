import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const { mockEnv, handlerFetch } = vi.hoisted(() => ({
  mockEnv: {
    OTEL_SERVICE_NAME: "merit-node",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://otlp.example",
    OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer test-secret",
    OTEL_TRACE_FILTER: "checkly",
  },
  handlerFetch: vi.fn(async () => new Response("ok", { status: 200 })),
}));

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: handlerFetch },
  createServerEntry: <T>(entry: T) => entry,
}));

vi.mock("@merit/mcp", () => ({
  mcpResourceMetadata: vi.fn(() => new Response("metadata", { status: 200 })),
  handleWorkspaceMcp: vi.fn(),
}));

import { ensureServerTelemetry } from "@merit/telemetry/server";

import serverEntry from "../src/server";

const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));

beforeEach(() => {
  for (const [key, value] of Object.entries(mockEnv)) {
    vi.stubEnv(key, value);
  }
  handlerFetch.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await ensureServerTelemetry({});
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("batches sampled requests with independent trace IDs into one scheduled OTLP export", async () => {
  vi.useFakeTimers();
  const traceIds = ["4bf92f3577b34da6a3ce929d0e0e4736", "0af7651916cd43dd8448eb211c80319c"];
  const responses = await Promise.all(
    traceIds.map(async (traceId) =>
      serverEntry.fetch(
        new Request("https://merit.example/demo", {
          headers: {
            traceparent: `00-${traceId}-00f067aa0ba902b7-01`,
            tracestate: "checkly=true",
          },
        }),
        {} as never,
      ),
    ),
  );
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(fetchMock).not.toHaveBeenCalled();
  await vi.advanceTimersToNextTimerAsync();
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
  expect(serviceAttr?.value.stringValue).toBe("merit-node");
  const spans = payload.resourceSpans[0]!.scopeSpans[0]!.spans;
  expect(spans.map((span) => span.traceId).sort()).toEqual([...traceIds].sort());
  expect(spans.map((span) => span.name)).toEqual(["HTTP GET /demo", "HTTP GET /demo"]);
});

it("does not export spans when tracestate lacks the checkly marker under default filter", async () => {
  const response = await serverEntry.fetch(new Request("https://merit.example/demo"), {} as never);

  expect(response.status).toBe(200);
  await (
    await ensureServerTelemetry({
      endpoint: mockEnv.OTEL_EXPORTER_OTLP_ENDPOINT,
      headers: mockEnv.OTEL_EXPORTER_OTLP_HEADERS,
      serviceName: mockEnv.OTEL_SERVICE_NAME,
    })
  )?.forceFlush();
  expect(fetchMock).not.toHaveBeenCalled();
});
