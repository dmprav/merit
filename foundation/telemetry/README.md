# `@merit/telemetry`

Centralized OpenTelemetry tracing helpers and Node.js OTLP/HTTP export for Merit.

## Entrypoints

- `@merit/telemetry` ([`src/index.ts`](src/index.ts)): server-side helpers (`withSpan`, `instrumentService`, `setSpanAttributes`, `recordSafeError`, `currentTraceId`) used by `foundation/db`, `interfaces/mcp`, and `app`.
- `@merit/telemetry/errors` ([`src/errors.ts`](src/errors.ts)): browser- and server-safe error reporting (`reportError`, `setErrorReporter`) that normalizes errors, redacts sensitive fields, and logs structured `[merit:error]` payloads until an external reporter (such as Sentry) is registered.
- `@merit/telemetry/server` ([`src/server.ts`](src/server.ts)): Server HTTP wrapper (`traceServerRequest`, `ensureServerTelemetry`) that extracts incoming W3C `traceparent`/`tracestate` headers, normalizes route labels to low-cardinality templates, and queues sampled spans in a shared OpenTelemetry batch processor. The processor exports across requests on its timer or when a batch fills. Shutting down the provider drains its remaining batch.

## Boundaries and privacy

- Keep `@opentelemetry/*` imports inside `foundation/telemetry`. Architecture lint rejects direct OpenTelemetry imports elsewhere.
- Only host wiring (`app/src`) reads environment variables and passes `ServerTelemetryConfig` into `traceServerRequest`.
- Never record grant content, applicant/reviewer emails, invitation tokens, OAuth tokens, or raw exception messages on spans. Use `recordSafeError` and low-cardinality route patterns (`describeHttpRoute`).

## Verify

```sh
vp run @merit/telemetry#test
```
