import { ROOT_CONTEXT, SpanStatusCode, context, trace } from "@opentelemetry/api";
import { ExportResultCode } from "@opentelemetry/core";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { currentTraceId, withSpan } from "./index";
import { FetchOtlpTraceExporter, parseOtlpHeaders, resolveTracesUrl } from "./otlp-exporter";
import { describeHttpRoute } from "./route-label";
import { createTraceSampler, resolveTraceFilter } from "./sampler";
import { ensureServerTelemetry, traceServerRequest } from "./server";

describe("@merit/telemetry server and Checkly integration", () => {
  afterEach(async () => {
    await ensureServerTelemetry({});
    vi.restoreAllMocks();
  });

  it("parses OTLP headers and normalizes trace endpoint URLs", () => {
    expect(parseOtlpHeaders()).toEqual({});
    expect(
      parseOtlpHeaders(
        "Authorization = Bearer abc=123== , invalid-pair , =no-key , x-empty=, x-team=merit",
      ),
    ).toEqual({
      authorization: "Bearer abc=123==",
      "x-team": "merit",
    });

    expect(resolveTracesUrl()).toBeNull();
    expect(resolveTracesUrl("   ")).toBeNull();
    expect(resolveTracesUrl("not-a-url")).toBeNull();
    expect(resolveTracesUrl("ftp://otel.example.com")).toBeNull();
    expect(resolveTracesUrl("http://collector.example")).toBeNull();
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(resolveTracesUrl(`http://${host}:4318`)).toBe(`http://${host}:4318/v1/traces`);
    }
    expect(resolveTracesUrl("https://otel.eu-west-1.checklyhq.com")).toBe(
      "https://otel.eu-west-1.checklyhq.com/v1/traces",
    );
    expect(resolveTracesUrl("https://otel.example.com/collector/")).toBe(
      "https://otel.example.com/collector/v1/traces",
    );
    expect(resolveTracesUrl("https://otel.example.com/v1/traces/")).toBe(
      "https://otel.example.com/v1/traces",
    );
  });

  it("normalizes Merit paths into low-cardinality route templates", () => {
    expect(describeHttpRoute("/")).toEqual({ route: "/", surface: "site" });
    expect(describeHttpRoute("/demo")).toEqual({ route: "/demo", surface: "site" });
    expect(describeHttpRoute("/demo/workshop-saturdays")).toEqual({
      route: "/demo/workshop-saturdays",
      surface: "site",
    });
    expect(describeHttpRoute("/docs/mcp")).toEqual({ route: "/docs/mcp", surface: "site" });
    expect(describeHttpRoute("/mcp/workspace")).toEqual({
      route: "/mcp/workspace",
      surface: "mcp",
    });
    expect(describeHttpRoute("/.well-known/oauth-protected-resource/mcp/workspace")).toEqual({
      route: "/.well-known/oauth-protected-resource/mcp/workspace",
      surface: "mcp",
    });
    expect(describeHttpRoute("/invitations/secret-token-123")).toEqual({
      route: "/invitations/:token",
      surface: "product",
    });
    expect(describeHttpRoute("/app")).toEqual({ route: "/app", surface: "product" });
    expect(describeHttpRoute("/app/sign-in")).toEqual({
      route: "/app/sign-in",
      surface: "product",
    });
    expect(describeHttpRoute("/app/alder")).toEqual({
      route: "/app/:workspace",
      surface: "product",
    });
    expect(describeHttpRoute("/app/alder/rounds")).toEqual({
      route: "/app/:workspace/rounds",
      surface: "product",
    });
    expect(describeHttpRoute("/app/alder/applications/workshop-123")).toEqual({
      route: "/app/:workspace/applications/:id",
      surface: "product",
    });
    expect(describeHttpRoute("/app/alder/work/assign-123")).toEqual({
      route: "/app/:workspace/work/:id",
      surface: "product",
    });
    expect(describeHttpRoute("/app/alder/settings")).toEqual({
      route: "/app/:workspace/settings",
      surface: "product",
    });
    expect(describeHttpRoute("/app/alder/settings/members")).toEqual({
      route: "/app/:workspace/settings/members",
      surface: "product",
    });
    expect(describeHttpRoute("/app/alder/unknown/extra")).toEqual({
      route: "/app/:workspace/*",
      surface: "product",
    });
    expect(describeHttpRoute("/admin/organizations")).toEqual({
      route: "/admin/organizations",
      surface: "admin",
    });
    expect(describeHttpRoute("/admin/other")).toEqual({
      route: "/admin/*",
      surface: "admin",
    });
    expect(describeHttpRoute("/_serverFn/createRound")).toEqual({
      route: "/_serverFn/:fn",
      surface: "product",
    });
    expect(describeHttpRoute("/robots.txt")).toEqual({ route: "/*other", surface: "other" });
  });

  it("samples only Checkly tracestate spans by default, or all spans when configured", () => {
    expect(resolveTraceFilter()).toBe("checkly");
    expect(resolveTraceFilter("checkly")).toBe("checkly");
    expect(resolveTraceFilter("ALL")).toBe("all");

    const checklySampler = createTraceSampler("checkly");
    expect(checklySampler.toString()).toBe("ChecklyTraceSampler");
    expect(checklySampler.shouldSample(ROOT_CONTEXT, "1".repeat(32), "op", 0, {}, [])).toEqual({
      decision: 0,
    });

    const allSampler = createTraceSampler("all");
    expect(allSampler.shouldSample(ROOT_CONTEXT, "1".repeat(32), "op", 0, {}, [])).toEqual({
      decision: 2,
    });
  });

  it("acts as a zero-overhead pass-through when endpoint is unset", async () => {
    const response = await traceServerRequest(
      new Request("https://merit.example/"),
      { endpoint: "" },
      async () => new Response("ok", { status: 200 }),
    );

    expect(response.status).toBe(200);
  });

  it("samples Checkly requests using incoming traceparent and tracestate and flushes ended spans", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const handle = await ensureServerTelemetry(
      {
        endpoint: "https://otel.eu-west-1.checklyhq.com",
        headers: "authorization=test-key",
        serviceName: "merit-node",
      },
      { fetchFn: fetchMock },
    );
    expect(handle).not.toBeNull();

    // Calling again with identical config reuses the active telemetry instance.
    const sameHandle = await ensureServerTelemetry({
      endpoint: "https://otel.eu-west-1.checklyhq.com",
      headers: "authorization=test-key",
      serviceName: "merit-node",
    });
    expect(sameHandle).toBe(handle);

    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const parentSpanId = "00f067aa0ba902b7";

    await traceServerRequest(
      new Request("https://merit.example/app/alder/rounds"),
      {
        endpoint: "https://otel.eu-west-1.checklyhq.com",
        headers: "authorization=test-key",
        serviceName: "merit-node",
      },
      async () => new Response("ignored", { status: 200 }),
    );
    await handle!.forceFlush();
    expect(fetchMock).not.toHaveBeenCalled();

    const seenTraceIds: Array<string | undefined> = [];
    const response = await traceServerRequest(
      new Request("https://merit.example/app/alder/rounds", {
        headers: {
          traceparent: `00-${traceId}-${parentSpanId}-01`,
          tracestate: "checkly=true",
        },
      }),
      {
        endpoint: "https://otel.eu-west-1.checklyhq.com",
        headers: "authorization=test-key",
        serviceName: "merit-node",
      },
      async () => {
        await withSpan("child.work", async () => {
          seenTraceIds.push(currentTraceId());
        });
        return new Response("error", { status: 503 });
      },
    );

    expect(response.status).toBe(503);
    expect(seenTraceIds).toEqual([traceId]);
    await handle!.forceFlush();

    expect(fetchMock).toHaveBeenCalledOnce();
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const [requestUrl, requestInit] = calls[0]!;
    expect(requestUrl).toBe("https://otel.eu-west-1.checklyhq.com/v1/traces");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.redirect).toBe("error");
    expect(requestInit.headers).toMatchObject({
      authorization: "test-key",
      "content-type": "application/json",
    });

    const parsed = JSON.parse(new TextDecoder().decode(requestInit.body as Uint8Array)) as {
      resourceSpans: Array<{
        scopeSpans: Array<{ spans: Array<{ name: string; traceId: string }> }>;
      }>;
    };
    const exportedSpans = parsed.resourceSpans[0]!.scopeSpans[0]!.spans;
    expect(exportedSpans.map((span) => span.name)).toEqual([
      "child.work",
      "HTTP GET /app/:workspace/rounds",
    ]);
    expect(exportedSpans.every((span) => span.traceId === traceId)).toBe(true);

    fetchMock.mockResolvedValueOnce(new Response("collector error", { status: 500 }));
    const failedExportResponse = await traceServerRequest(
      new Request("https://merit.example/app/alder/rounds", {
        headers: {
          traceparent: `00-${traceId}-${parentSpanId}-01`,
          tracestate: "checkly=true",
        },
      }),
      {
        endpoint: "https://otel.eu-west-1.checklyhq.com",
        headers: "authorization=test-key",
        serviceName: "merit-node",
      },
      async () => new Response("ok", { status: 200 }),
    );
    expect(failedExportResponse.status).toBe(200);
    await expect(handle!.forceFlush()).rejects.toEqual([
      new Error("OTLP export returned HTTP 500."),
    ]);
  });

  it("bounds marked requests across the process and preserves each admitted trace's children", async () => {
    const exporter = new InMemorySpanExporter();
    const config = { endpoint: "https://collector.example" };
    await ensureServerTelemetry(config, { spanProcessor: new SimpleSpanProcessor({ exporter }) });
    await traceServerRequest(
      new Request("https://merit.example/", {
        headers: {
          traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        },
      }),
      config,
      async () => new Response("ok"),
    );
    expect(exporter.getFinishedSpans()).toHaveLength(0);
    const clock = vi.spyOn(performance, "now").mockReturnValue(100);

    const visit = (id: number) =>
      traceServerRequest(
        new Request("https://merit.example/", {
          headers: {
            traceparent: `00-${id.toString(16).padStart(32, "0")}-00f067aa0ba902b7-01`,
            tracestate: "checkly=true",
          },
        }),
        config,
        () => withSpan("child", () => new Response("ok")),
      );

    await visit(1);
    clock.mockReturnValue(150);
    for (let id = 2; id <= 11; id++) {
      await visit(id);
    }
    expect(exporter.getFinishedSpans()).toHaveLength(20);
    clock.mockReturnValue(60_100);
    await visit(12);
    await visit(13);
    expect(exporter.getFinishedSpans()).toHaveLength(22);
  });

  it("handles FetchOtlpTraceExporter shutdown, empty batches, HTTP failures, and serializer failures", async () => {
    const exporter = new InMemorySpanExporter();
    await ensureServerTelemetry(
      { endpoint: "https://otel.example.com", traceFilter: "all" },
      { spanProcessor: new SimpleSpanProcessor({ exporter }) },
    );

    await withSpan("recorded.span", () => undefined);
    const sampleSpans = exporter.getFinishedSpans();
    expect(sampleSpans).toHaveLength(1);

    const results: Array<{ code: ExportResultCode; error?: Error }> = [];
    const fetchOk = vi.fn(async () => new Response(null, { status: 202 }));
    const httpExporter = new FetchOtlpTraceExporter({
      url: "https://otel.example.com/v1/traces",
      fetchFn: fetchOk,
    });

    httpExporter.export([], (result) => results.push(result));
    expect(results.at(-1)?.code).toBe(ExportResultCode.SUCCESS);

    await new Promise<void>((resolve) => {
      httpExporter.export(sampleSpans, (result) => {
        results.push(result);
        resolve();
      });
    });
    expect(results.at(-1)?.code).toBe(ExportResultCode.SUCCESS);

    const serializeSpy = vi
      .spyOn(JsonTraceSerializer, "serializeRequest")
      .mockReturnValueOnce(undefined);
    httpExporter.export(sampleSpans, (result) => results.push(result));
    expect(results.at(-1)?.code).toBe(ExportResultCode.FAILED);
    serializeSpy.mockRestore();

    const failResponseExporter = new FetchOtlpTraceExporter({
      url: "https://otel.example.com/v1/traces",
      fetchFn: vi.fn(async () => new Response("rejected", { status: 500 })),
    });
    await new Promise<void>((resolve) => {
      failResponseExporter.export(sampleSpans, (result) => {
        results.push(result);
        resolve();
      });
    });
    expect(results.at(-1)?.code).toBe(ExportResultCode.FAILED);
    expect(results.at(-1)?.error?.message).toBe("OTLP export returned HTTP 500.");

    const throwErrorExporter = new FetchOtlpTraceExporter({
      url: "https://otel.example.com/v1/traces",
      fetchFn: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    await new Promise<void>((resolve) => {
      throwErrorExporter.export(sampleSpans, (result) => {
        results.push(result);
        resolve();
      });
    });
    expect(results.at(-1)?.error?.message).toBe("network down");

    const throwPrimitiveExporter = new FetchOtlpTraceExporter({
      url: "https://otel.example.com/v1/traces",
      fetchFn: vi.fn(async () => {
        throw "raw-failure";
      }),
    });
    await new Promise<void>((resolve) => {
      throwPrimitiveExporter.export(sampleSpans, (result) => {
        results.push(result);
        resolve();
      });
    });
    expect(results.at(-1)?.error?.message).toBe("OTLP export request failed.");

    await httpExporter.shutdown();
    httpExporter.export(sampleSpans, (result) => results.push(result));
    expect(results.at(-1)?.code).toBe(ExportResultCode.SUCCESS);
  });

  it("exports the previous batch on reconfiguration and installs the new provider", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const handle = await ensureServerTelemetry({
      endpoint: "https://otel.example.com",
      traceFilter: "all",
    });
    expect(handle).not.toBeNull();

    await withSpan("before-reconfiguration", () => undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
    const replaced = await ensureServerTelemetry({
      endpoint: "https://otel.example.com",
      serviceName: "another-service",
      traceFilter: "all",
    });
    expect(replaced).not.toBe(handle);
    expect(fetchSpy).toHaveBeenCalledOnce();

    await context.with(
      trace.setSpan(ROOT_CONTEXT, trace.getTracer("t").startSpan("x")),
      async () => {
        expect(currentTraceId()).toBeDefined();
      },
    );
  });

  it("handles unreadable SpanStatusCode cleanly on empty failed response", async () => {
    const exporter = new FetchOtlpTraceExporter({
      url: "https://otel.example.com/v1/traces",
      fetchFn: vi.fn(async () => ({ ok: false, status: 401 }) as Response),
    });
    const memory = new InMemorySpanExporter();
    await ensureServerTelemetry(
      { endpoint: "https://otel.example.com", traceFilter: "all" },
      { spanProcessor: new SimpleSpanProcessor({ exporter: memory }) },
    );
    await withSpan("one", () => undefined);
    const result = await new Promise<{ code: ExportResultCode }>((resolve) =>
      exporter.export(memory.getFinishedSpans(), resolve),
    );
    expect(result.code).toBe(ExportResultCode.FAILED);
    expect(SpanStatusCode.ERROR).toBe(2);
  });
});
