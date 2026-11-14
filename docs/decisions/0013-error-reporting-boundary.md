# Use a shared error-reporting boundary before adding Sentry

Accepted 14 November 2026.

Route application and boundary error reporting through `@merit/telemetry/errors`
(`reportError` and `setErrorReporter`) instead of calling `console.error` ad hoc
or bundling Sentry before live usage justifies it.

By default, `reportError` normalizes errors, redacts sensitive fields (tokens,
cookies, emails, and message bodies), and logs structured JSON to
`console.error`, which Cloudflare Workers Logs capture automatically.

When client-side visibility, release tracking, or alerting warrants Sentry,
initialize `@sentry/cloudflare` and `@sentry/react` in `@merit/app` and register
them via `setErrorReporter` without changing feature or interface call sites.
