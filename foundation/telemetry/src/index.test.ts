import { SpanStatusCode, context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  SpanKind,
  currentTraceId,
  instrumentService,
  recordSafeError,
  setSpanAttributes,
  withSpan,
} from "./index";

describe("@merit/telemetry core helpers", () => {
  let exporter: InMemorySpanExporter;
  let provider: TracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
    });
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    trace.disable();
    context.disable();
    propagation.disable();
    await provider.shutdown();
  });

  it("creates active spans with compacted attributes and returns trace IDs", async () => {
    expect(currentTraceId()).toBeUndefined();

    const value = await withSpan(
      "merit.test.operation",
      async (span) => {
        setSpanAttributes(span, {
          "merit.present": "yes",
          "merit.omitted": undefined,
        });
        setSpanAttributes(span, {});
        return currentTraceId();
      },
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          "merit.initial": 42,
          "merit.skip": undefined,
        },
      },
    );

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe("merit.test.operation");
    expect(spans[0]!.kind).toBe(SpanKind.INTERNAL);
    expect(spans[0]!.attributes).toEqual({
      "merit.initial": 42,
      "merit.present": "yes",
    });
    expect(value).toBe(spans[0]!.spanContext().traceId);
  });

  it("records safe error types without leaking exception messages or confidential values", async () => {
    const secretError = new TypeError("secret token sk_live_should_never_leak");

    await expect(
      withSpan("merit.test.fail", () => {
        throw secretError;
      }),
    ).rejects.toThrow("secret token");

    await withSpan("merit.test.primitive_fail", (span) => {
      recordSafeError(span, null);
      recordSafeError(span, "raw confidential string");
      recordSafeError(
        span,
        new (class UnnamedError extends Error {
          override name = "";
        })("msg"),
      );
    });

    const spans = exporter.getFinishedSpans();
    expect(spans[0]!.status).toEqual({ code: SpanStatusCode.ERROR, message: "TypeError" });
    expect(spans[0]!.attributes["error.type"]).toBe("TypeError");
    expect(spans[1]!.attributes["error.type"]).toBe("object");
    const serialized = new TextDecoder().decode(JsonTraceSerializer.serializeRequest(spans)!);
    expect(serialized).not.toContain("should_never_leak");
    expect(serialized).not.toContain("raw confidential string");
  });

  it("wraps service methods and records merit.outcome only for string status objects", async () => {
    const raw = {
      label: "rounds",
      async findRound(id: string) {
        return { status: "ok" as const, id };
      },
      async ping() {
        return "pong";
      },
      async missing() {
        return { status: 404 };
      },
    };

    const service = instrumentService("rounds", raw);
    expect(service.label).toBe("rounds");
    expect(await service.findRound("r1")).toEqual({ status: "ok", id: "r1" });
    expect(await service.ping()).toBe("pong");
    expect(await service.missing()).toEqual({ status: 404 });

    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual([
      "service.rounds.findRound",
      "service.rounds.ping",
      "service.rounds.missing",
    ]);
    expect(spans[0]!.attributes["merit.outcome"]).toBe("ok");
    expect(spans[1]!.attributes["merit.outcome"]).toBeUndefined();
    expect(spans[2]!.attributes["merit.outcome"]).toBeUndefined();
  });
});
