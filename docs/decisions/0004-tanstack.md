# Build the web application with TanStack

Accepted 7 November 2026.

Use React with TanStack Start and Router as the web foundation. Interest in
TanStack's approach to type safety and application design motivated the choice;
Merit provides a practical opportunity to explore it.

Prefer additional TanStack libraries where they serve an application need.
TanStack Form handles forms, and TanStack Table supplies sorting for interactive
data tables through `@merit/tables`. Evaluate the approach
through how understandable development, debugging, and maintenance remain as
the application grows.

On 9 November 2026, adopt TanStack Query for fetched data and mutations across
web, administration, and the demo. These interfaces had accumulated separate
copies of loader data, refresh functions, and mutation coordination. Query gives
them a shared lifecycle while Router retains navigation and forms retain drafts.
Keep shared configuration in `@merit/query` and resource-specific behavior in
features. This adds explicit cache invalidation and account-lifetime responsibilities;
the [architecture](../foundations/architecture.md#runtime-and-request-flow) defines
their ownership.
