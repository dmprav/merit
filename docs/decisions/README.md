# Project decisions

Reasons and trade-offs behind consequential product, design, technical, and
operating choices. Records receive a stable sequential ID when added.

| ID   | Decision                                                           | Rationale                                                                   |
| ---- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 0001 | [TypeScript throughout](0001-typescript.md)                        | Ecosystem, shared language, types, and backend learning.                    |
| 0002 | [Reusable business core](0002-shared-business-core.md)             | Protect domain logic and reuse it across interfaces.                        |
| 0003 | [Cloudflare Workers](0003-cloudflare-workers.md)                   | Learn a different platform while keeping operations simple.                 |
| 0004 | [TanStack web foundation](0004-tanstack.md)                        | Explore its application design and ecosystem.                               |
| 0005 | [Owned design system](0005-design-system.md)                       | Control the look and feel with manageable maintenance.                      |
| 0006 | [PostgreSQL and Drizzle](0006-postgresql-and-drizzle.md)           | Transactions and control over persistence.                                  |
| 0007 | [Clerk authentication](0007-clerk.md)                              | Hosted identity that fits the stack and budget.                             |
| 0008 | [Keep monetary values exact](0008-money.md)                        | Preserve every cent through calculations, storage, and display.             |
| 0009 | [Disposable demo workspaces](0009-demo-workspaces.md)              | Exercise real product behavior and avoid maintaining a separate simulation. |
| 0010 | [Delegated MCP authority](0010-mcp-delegated-authority.md)         | Complete work through MCP with approval requirements owned by the workflow. |
| 0011 | [Shared authorization policy](0011-shared-authorization-policy.md) | Keep permission checks and SQL filtering consistent.                        |
| 0012 | [Centralize telemetry and Checkly](0012-opentelemetry-checkly.md)  | Correlate Worker spans cleanly without leaking data or vendor lock-in.      |

[All documentation](../README.md)
