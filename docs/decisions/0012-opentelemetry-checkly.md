# Centralize Worker tracing in telemetry foundation and Checkly config

Accepted 14 November 2026.

Instrument Merit server boundaries through a dedicated foundation package ([`@merit/telemetry`](../../foundation/telemetry/README.md)), export OpenTelemetry spans over `fetch` OTLP/HTTP JSON using Cloudflare `waitUntil`, and store Checkly synthetic checks as code under [`tooling/checkly`](../../tooling/checkly/README.md).

An alternative would emit structured logs only or use Node-oriented OpenTelemetry SDK transports with `AlwaysOn` sampling. Structured logs alone lack parent-child span correlation across HTTP, authentication, MCP tools, capability services, email delivery, and PostgreSQL calls. Node transports pull in `node:http` and `zlib`, whereas a minimal `fetch` exporter works natively in Cloudflare Workers without adding third-party vendor SDKs inside application code.

The cost is owning the small OTLP HTTP exporter and keeping span attributes strictly sanitized so grant materials, tokens, emails, and raw provider errors never leave the boundary. When `OTEL_EXPORTER_OTLP_ENDPOINT` is configured, tracing defaults to sampling requests carrying Checkly's `tracestate` marker (`checkly=true`) so ordinary traffic is not exported unless `OTEL_TRACE_FILTER` is explicitly set to `all`.

Keep pure business rules and browser UI free of telemetry imports; wrap services at host assembly instead. Revisit `OTEL_TRACE_FILTER` or collector routing if outbound AI/LLM calls (such as Langfuse) or full-traffic APM sampling are introduced later.
