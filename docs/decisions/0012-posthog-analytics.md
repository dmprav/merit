# Isolate PostHog analytics behind a cookieless foundation

Accepted 14 November 2026.

Use [PostHog](https://posthog.com/) through `@merit/analytics` to learn how
visitors explore the public website, documentation, and demo. Keep `posthog-js`
isolated in [`foundation/analytics`](../../foundation/analytics/README.md) so
features depend only on a vendor-neutral `AnalyticsProvider` and `useAnalytics`
contract, enforced by the [architecture import rules](../../tooling/verification/architecture/imports.ts).

The integration runs lazily and stays disabled whenever `VITE_POSTHOG_KEY` is
empty, keeping local development, tests, and unconfigured environments free of
extra bundle execution and network requests.

To protect tenant confidentiality and avoid tracking cookies during this
evaluation, PostHog runs with memory-only persistence, no person profiles, no
autocapture, no session recording, and path sanitization that strips query
strings, invitation tokens, assignment IDs, and workspace slugs before events
leave the browser. Reassess this choice if product funnels need cross-visit
attribution, server-side MCP telemetry, or a simpler traffic counter such as
Cloudflare Web Analytics proves sufficient.
