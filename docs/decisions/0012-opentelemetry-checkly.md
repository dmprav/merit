# Centralize server tracing and Checkly configuration

Accepted 14 November 2026. Updated for the [Node.js runtime](0003-node-runtime.md) on 18 November 2026.

The [telemetry foundation](../../foundation/telemetry/README.md) correlates HTTP
requests with authentication, MCP tools, capability operations, email delivery,
and PostgreSQL calls. One OpenTelemetry batch processor exports sampled spans
across requests over OTLP/HTTP. The [Checkly checks](../../tooling/checkly/README.md)
exercise the application from outside the server.

The cost is owning the small OTLP HTTP exporter and keeping span attributes strictly sanitized so grant materials, tokens, emails, and raw provider errors never leave the boundary. By default, only requests traced by Checkly are exported; [deployment](../guides/deployment.md#configure-tracing-and-synthetic-checks) describes the configuration.

Keep pure business rules and browser UI free of telemetry imports; wrap services at host assembly instead. Revisit `OTEL_TRACE_FILTER` or collector routing if outbound AI/LLM calls (such as Langfuse) or full-traffic APM sampling are introduced later.
