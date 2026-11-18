# Use a shared error-reporting boundary before adding Sentry

Accepted 14 November 2026. Updated for the [Node.js runtime](0003-node-runtime.md) on 18 November 2026.

Route application and boundary error reporting through `@merit/telemetry/errors`
(`reportError` and `setErrorReporter`) instead of calling `console.error` ad hoc
or bundling Sentry before live usage justifies it.

By default, `reportError` normalizes errors, redacts sensitive fields (tokens,
cookies, emails, and message bodies), and logs structured JSON to
`console.error` for collection by the server host or browser console.

When client-side visibility, release tracking, or alerting warrants Sentry,
configure the appropriate Node.js and browser integrations in `@merit/app`
and register them via `setErrorReporter`.
