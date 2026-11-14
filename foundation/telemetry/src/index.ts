import {
  SpanKind,
  SpanStatusCode,
  context,
  isSpanContextValid,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

export { SpanKind, SpanStatusCode, type Span };

export type TelemetryAttributeValue = string | number | boolean;

export type TelemetryAttributes = Record<string, TelemetryAttributeValue | undefined>;

export type StartSpanOptions = {
  attributes?: TelemetryAttributes;
  kind?: SpanKind;
};

const TRACER_NAME = "merit";

const compactAttributes = (attributes: TelemetryAttributes): Attributes => {
  const defined: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) {
      defined[key] = value;
    }
  }
  return defined;
};

const safeErrorType = (error: unknown): string => {
  if (error instanceof Error && error.name) {
    return error.name;
  }
  return error === null ? "null" : typeof error;
};

/** Record failure without attaching raw error messages that could carry confidential data. */
export const recordSafeError = (span: Span, error: unknown): void => {
  const errorType = safeErrorType(error);
  span.setAttribute("error.type", errorType);
  span.setStatus({ code: SpanStatusCode.ERROR, message: errorType });
};

export const setSpanAttributes = (span: Span, attributes: TelemetryAttributes): void => {
  span.setAttributes(compactAttributes(attributes));
};

export const withSpan = <T>(
  name: string,
  operation: (span: Span) => Promise<T> | T,
  options?: StartSpanOptions,
): Promise<T> =>
  trace.getTracer(TRACER_NAME).startActiveSpan(
    name,
    {
      kind: options?.kind,
      attributes: options?.attributes ? compactAttributes(options.attributes) : undefined,
    },
    async (span) => {
      try {
        return await operation(span);
      } catch (error) {
        recordSafeError(span, error);
        throw error;
      } finally {
        span.end();
      }
    },
  );

const attachOutcome = (span: Span, result: unknown): void => {
  if (result && typeof result === "object" && "status" in result) {
    const status = (result as { status?: unknown }).status;
    if (typeof status === "string") {
      span.setAttribute("merit.outcome", status);
    }
  }
};

export const instrumentService = <T extends object>(domain: string, service: T): T => {
  const wrapped: Record<string, unknown> = {};
  for (const [method, value] of Object.entries(service)) {
    wrapped[method] =
      typeof value === "function"
        ? (...args: unknown[]) =>
            withSpan(`service.${domain}.${method}`, async (span) => {
              const result: unknown = await (value as (...input: unknown[]) => unknown)(...args);
              attachOutcome(span, result);
              return result;
            })
        : value;
  }
  return wrapped as T;
};

export const currentTraceId = (): string | undefined => {
  const spanContext = trace.getSpan(context.active())?.spanContext();
  return spanContext && isSpanContextValid(spanContext) ? spanContext.traceId : undefined;
};
