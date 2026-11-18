import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, TracerProvider, type SpanProcessor } from "@opentelemetry/sdk-trace";

import { withSpan } from "./index";
import { FetchOtlpTraceExporter, parseOtlpHeaders, resolveTracesUrl } from "./otlp-exporter";
import { describeHttpRoute } from "./route-label";
import { createTraceSampler, resolveTraceFilter } from "./sampler";

export { describeHttpRoute };

export type ServerTelemetryConfig = {
  endpoint?: string;
  headers?: string;
  serviceName?: string;
  traceFilter?: string;
};

export type ServerTelemetryHandle = {
  forceFlush: () => Promise<void>;
  shutdown: () => Promise<void>;
};

type ActiveServerTelemetry = ServerTelemetryHandle & {
  configKey: string;
};

let activeTelemetry: ActiveServerTelemetry | undefined;

const resetGlobalRegistry = async (): Promise<void> => {
  const previous = activeTelemetry;
  activeTelemetry = undefined;
  trace.disable();
  context.disable();
  propagation.disable();
  if (previous) {
    await previous.shutdown();
  }
};

const createConfigKey = (
  url: string,
  serviceName: string,
  filter: string,
  headersRaw?: string,
): string => `${url}|${serviceName}|${filter}|${headersRaw ?? ""}`;

export const ensureServerTelemetry = async (
  config: ServerTelemetryConfig,
  options?: { spanProcessor?: SpanProcessor; fetchFn?: typeof fetch },
): Promise<ServerTelemetryHandle | null> => {
  const tracesUrl = resolveTracesUrl(config.endpoint);
  if (!tracesUrl) {
    if (activeTelemetry) {
      await resetGlobalRegistry();
    }
    return null;
  }

  const serviceName = config.serviceName?.trim() || "merit";
  const filter = resolveTraceFilter(config.traceFilter);
  const configKey = createConfigKey(tracesUrl, serviceName, filter, config.headers);

  if (activeTelemetry?.configKey === configKey && !options?.spanProcessor && !options?.fetchFn) {
    return activeTelemetry;
  }

  // Install the new provider before yielding so concurrent requests share its batch.
  const draining = resetGlobalRegistry();

  const processor =
    options?.spanProcessor ??
    new BatchSpanProcessor({
      exporter: new FetchOtlpTraceExporter({
        url: tracesUrl,
        headers: parseOtlpHeaders(config.headers),
        fetchFn: options?.fetchFn,
      }),
    });

  const provider = new TracerProvider({
    resource: resourceFromAttributes({
      "service.name": serviceName,
      "process.runtime.name": "nodejs",
    }),
    sampler: createTraceSampler(filter),
    spanProcessors: [processor],
  });

  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(provider);

  const handle = {
    configKey,
    forceFlush: () => provider.forceFlush(),
    shutdown: () => provider.shutdown(),
  };

  activeTelemetry = handle;
  await draining;
  return handle;
};

export const traceServerRequest = async (
  request: Request,
  config: ServerTelemetryConfig,
  handler: () => Promise<Response>,
): Promise<Response> => {
  const handle = await ensureServerTelemetry(config);
  if (!handle) {
    return handler();
  }

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const { route, surface } = describeHttpRoute(url.pathname);
  const parentContext = propagation.extract(
    ROOT_CONTEXT,
    Object.fromEntries(request.headers.entries()),
  );

  return context.with(parentContext, () =>
    withSpan(
      `HTTP ${method} ${route}`,
      async (span) => {
        const response = await handler();
        span.setAttribute("http.response.status_code", response.status);
        if (response.status >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${response.status}` });
        }
        return response;
      },
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.request.method": method,
          "http.route": route,
          "url.scheme": url.protocol.replace(":", ""),
          "merit.surface": surface,
        },
      },
    ),
  );
};
