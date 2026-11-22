# Use a shared error-reporting boundary before adding Sentry

Accepted 14 November 2026. Updated for the [Node.js runtime](0003-node-runtime.md) on 18 November 2026.

Route application and boundary error reporting through `@merit/telemetry/errors`
(`reportError` and `setErrorReporter`) instead of calling `console.error` ad hoc
or bundling Sentry before live usage justifies it.

Both the console and registered reporters receive a structured diagnostic with
the surface, a caller-defined stable operation name, and a standard error type.
Optional fields cover normalized routes, HTTP methods, email providers, and
numeric status. The boundary omits original exceptions, messages, stacks, and
arbitrary context values before dispatch. By default the server host or browser
console collects the diagnostic through `console.error`.

When client-side visibility, release tracking, or alerting warrants Sentry,
configure the appropriate Node.js and browser integrations in `@merit/app`
and register them via `setErrorReporter`.
