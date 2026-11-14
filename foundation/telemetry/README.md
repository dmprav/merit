# `@merit/telemetry`

Centralized OpenTelemetry tracing helpers and Cloudflare Workers OTLP/HTTP export for Merit.

## Entrypoints

- `@merit/telemetry` ([`src/index.ts`](src/index.ts)): server-side helpers (`withSpan`, `instrumentService`, `setSpanAttributes`, `recordSafeError`, `currentTraceId`) used by `foundation/db`, `interfaces/mcp`, and `app`.
- `@merit/telemetry/worker` ([`src/worker.ts`](src/worker.ts)): Worker HTTP wrapper (`traceWorkerRequest`, `ensureWorkerTelemetry`) that extracts incoming W3C `traceparent`/`tracestate` headers, normalizes route labels to low-cardinality templates, and flushes spans via Cloudflare `waitUntil`.

## Boundaries and privacy

- Keep `@opentelemetry/*` imports inside `foundation/telemetry`. Architecture lint rejects direct OpenTelemetry imports elsewhere.
- Only host wiring (`app/src`) reads Cloudflare `env` or `waitUntil` and passes `WorkerTelemetryConfig` into `traceWorkerRequest`.
- Never record grant content, applicant/reviewer emails, invitation tokens, OAuth tokens, or raw exception messages on spans. Use `recordSafeError` and low-cardinality route patterns (`describeHttpRoute`).

## Verify

```sh
vp run @merit/telemetry#test
```
