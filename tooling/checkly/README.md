# `@merit/checkly`

Checkly synthetic monitoring configuration and starter checks for Merit.

## What is included

- [`checkly.config.ts`](checkly.config.ts): project definition (`merit`), shared schedules, regions, retry policy, and check glob patterns.
- [`tests/public-endpoints.check.ts`](tests/public-endpoints.check.ts): `ApiCheck` coverage for `/`, `/docs/mcp`, `/demo`, and `/app/sign-in` (status codes, framing protection headers, and cache headers).
- [`tests/demo-journey.check.ts`](tests/demo-journey.check.ts) and [`tests/demo-journey.spec.ts`](tests/demo-journey.spec.ts): Playwright `BrowserCheck` opening `/demo` and provisioning a demo workspace through `/app/demo-.../rounds`.

## Usage

Sign in with `npx checkly login` (or configure `CHECKLY_API_KEY` and `CHECKLY_ACCOUNT_ID`), then set `MERIT_BASE_URL` to your preview or production origin:

```sh
vp run @merit/checkly#typecheck
vp run @merit/checkly#test
MERIT_BASE_URL=https://your-merit-origin.example vp run @merit/checkly#test:synthetic
MERIT_BASE_URL=https://your-merit-origin.example vp run @merit/checkly#deploy
```

Checkly sends W3C `traceparent` and `tracestate` (`checkly=true`) headers automatically, allowing Merit's Worker telemetry in [`foundation/telemetry`](../../foundation/telemetry/README.md) to export synthetic request traces even under `OTEL_TRACE_FILTER=checkly`.
