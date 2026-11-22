# `@merit/analytics`

Merit records [product analytics for a defined purpose](../../docs/decisions/0014-posthog-analytics.md).
Configure the project token at [build time](../../docs/guides/deployment.md#configure-identity-and-the-public-address).

## Browser activity

The shell supplies `AnalyticsProvider`. Features call `useAnalytics` for demo
starts, resets, and invitation request submissions. The browser adapter also
records page views as route patterns, such as `/app/:workspace/rounds/:round`.
It loads `posthog-js` only when configured and uses in-memory identity.
Autocapture, session recording, surveys, and person profiles are disabled.

Before an event leaves the browser, every property `posthog-js` derives from the
location, including the session's entry URL and referrer, is reduced to a known
route pattern without its query string or fragment. Paths outside the known
routes are recorded as `/*other`, and page titles and IP addresses are dropped.
Add each new page to the patterns in [`index.tsx`](src/index.tsx); the shell's
[analytics test](../../app/src/shell/analytics.test.tsx) fails to typecheck
until every route in the route tree has one.

## Grant work and MCP

The server records confirmed grant outcomes from the shared web and MCP operations.
Filter on `workspace_kind = standard` to study invited workspaces. Count distinct
`workspace_key` values to measure how many workspaces carried out an action.
To measure repeat use, count keys with activity in two different periods. Group
by `surface` to compare web and MCP. Demo outcomes use `workspace_kind = demo`
and omit the key. The key is derived from the stable internal workspace ID.

| Event                          | Counted once for                                             |
| ------------------------------ | ------------------------------------------------------------ |
| `round_created`                | A newly created funding round                                |
| `application_recorded`         | A newly recorded application                                 |
| `assessment_submitted`         | A reviewer's first submission for an assignment              |
| `funding_recommendation_saved` | A saved change to a funding recommendation                   |
| `mcp_tool_finished`            | One call to a known MCP tool, with its tool name and outcome |

A successful MCP write can produce both a grant outcome and a tool-call event.
Tool calls include repeated attempts. Their counts measure tool usage and results.
Grant outcomes exclude retries that return an existing result. Server events
carry no person identifier, tool arguments, grant content, or response text.
Delivery is best effort and can drop events when ingestion is slow or unavailable.
