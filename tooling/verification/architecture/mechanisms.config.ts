import { z } from "zod";

export const MAX_SUMMARY_LENGTH = 120;

export const mechanismSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().min(1),
  contracts: z.array(z.string().min(1)).min(1),
  adapters: z.array(z.string().min(1)),
  docs: z.array(z.string().min(1)).min(1),
  decisions: z.array(z.string().min(1)),
});

export type Mechanism = z.infer<typeof mechanismSchema>;

/**
 * Cross-cutting architectural mechanisms whose owners, docs, and active
 * decision records span multiple capabilities or interfaces.
 */
export const MECHANISMS: readonly Mechanism[] = [
  {
    id: "authorization-policy",
    summary:
      "Single policy table evaluated in TypeScript and SQL with current server facts and locks.",
    contracts: [
      "capabilities/access/src/**",
      "foundation/auth/src/**",
      "capabilities/organizations/business/src/server/persistence/scope.ts",
    ],
    adapters: [],
    docs: [
      "capabilities/access/README.md",
      "docs/foundations/architecture.md#authority-across-interfaces",
    ],
    decisions: [
      "docs/decisions/0007-clerk.md",
      "docs/decisions/0011-shared-authorization-policy.md",
    ],
  },
  {
    id: "audit-trail",
    summary:
      "Append-only workspace activity events committed inside the owning command transaction.",
    contracts: ["capabilities/audit/business/src/**"],
    adapters: [],
    docs: ["capabilities/audit/business/README.md"],
    decisions: ["docs/decisions/0006-postgresql-and-drizzle.md"],
  },
  {
    id: "locks-and-transactions",
    summary:
      "Shared database transactions, grant-work lock order, and assembly-wired lifecycle hooks.",
    contracts: [
      "foundation/db/src/**",
      "foundation/db/database/**",
      "capabilities/organizations/business/src/server/persistence/commands/locks.ts",
      "capabilities/organizations/business/src/server/persistence/member-transactions.ts",
      "capabilities/*/business/src/server/grant-work.ts",
      "capabilities/*/business/src/server/integrations.ts",
    ],
    adapters: [],
    docs: [
      "docs/foundations/architecture.md#consistent-changes-and-recovery",
      "docs/guides/architecture-checks.md#connect-capabilities-through-declared-integrations",
    ],
    decisions: ["docs/decisions/0006-postgresql-and-drizzle.md"],
  },
  {
    id: "drafts-and-recovery",
    summary: "IndexedDB draft recovery, save-vs-refresh state separation, and focus preservation.",
    contracts: [
      "foundation/drafts/src/**",
      "foundation/query/src/**",
      "foundation/ui/src/patterns/editing/**",
    ],
    adapters: ["capabilities/*/web/src/controllers/**", "interfaces/*/src/**/controllers/**"],
    docs: [
      "foundation/drafts/README.md",
      "foundation/query/README.md",
      "docs/guides/web-features.md#preserve-the-result-of-an-action",
      "foundation/ui/src/patterns/editing/editing.mdx",
    ],
    decisions: ["docs/decisions/0004-tanstack.md"],
  },
  {
    id: "exact-money",
    summary:
      "Integer minor-unit (bigint) monetary arithmetic, validation, encoding, and formatting.",
    contracts: ["foundation/money/src/**", "foundation/ui/src/components/fields/money-field/**"],
    adapters: [],
    docs: ["foundation/money/README.md"],
    decisions: ["docs/decisions/0008-money.md"],
  },
  {
    id: "delegated-mcp",
    summary: "OAuth-scoped MCP tools enforcing capability preconditions and web parity.",
    contracts: [
      "foundation/ai/src/**",
      "interfaces/mcp/src/app/**",
      "interfaces/mcp/src/contracts.ts",
    ],
    adapters: ["capabilities/*/ai/src/**"],
    docs: [
      "interfaces/mcp/README.md",
      "docs/guides/mcp.md",
      "docs/foundations/architecture.md#authority-across-interfaces",
    ],
    decisions: [
      "docs/decisions/0010-mcp-delegated-authority.md",
      "docs/decisions/0011-shared-authorization-policy.md",
    ],
  },
  {
    id: "demo-lifecycle",
    summary:
      "Isolated disposable PostgreSQL demo workspaces built from capability example builders.",
    contracts: ["app/src/server/demo*.ts", "app/scripts/clean-demos.ts"],
    adapters: ["capabilities/*/business/src/server/demo.ts"],
    docs: ["docs/guides/development.md#demo-lifecycle-checks-and-cleanup"],
    decisions: ["docs/decisions/0009-demo-workspaces.md"],
  },
  {
    id: "telemetry-and-analytics",
    summary:
      "Sanitized OpenTelemetry tracing, reportError boundary, and cookieless PostHog analytics.",
    contracts: ["foundation/telemetry/src/**", "foundation/analytics/src/**"],
    adapters: [],
    docs: ["foundation/telemetry/README.md", "foundation/analytics/README.md"],
    decisions: [
      "docs/decisions/0012-opentelemetry-checkly.md",
      "docs/decisions/0013-error-reporting-boundary.md",
      "docs/decisions/0014-posthog-analytics.md",
    ],
  },
  {
    id: "shared-ui-patterns",
    summary:
      "Shared @merit/ui tokens, React Aria controls, layout patterns, and Storybook baselines.",
    contracts: ["foundation/ui/src/**", "foundation/forms/src/**", "foundation/tables/src/**"],
    adapters: [],
    docs: [
      "foundation/ui/README.md",
      "docs/guides/ui.md#compose-and-style-a-feature",
      "docs/guides/ui-verification.md",
    ],
    decisions: ["docs/decisions/0005-design-system.md"],
  },
];
