import { z } from "zod";

export const MAX_SUMMARY_LENGTH = 120;
export const MAX_INVARIANTS_PER_MECHANISM = 3;
export const MAX_INVARIANT_LENGTH = 140;

export const mechanismSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().min(1),
  contracts: z.array(z.string().min(1)).min(1),
  adapters: z.array(z.string().min(1)),
  docs: z.array(z.string().min(1)).min(1),
  decisions: z.array(z.string().min(1)),
  invariants: z.array(z.string().min(1)).optional(),
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
    adapters: ["capabilities/*/business/src/server/**"],
    docs: [
      "capabilities/access/README.md",
      "docs/foundations/architecture.md#authority-across-interfaces",
    ],
    decisions: [
      "docs/decisions/0007-clerk.md",
      "docs/decisions/0011-shared-authorization-policy.md",
    ],
    invariants: [
      "Evaluate current server facts under transaction locks across web and MCP; never trust client or stale claims.",
      "After membership removal and restoration, pending invitations and assignments stay inaccessible until reinstated.",
      "When authorization prerequisites change, update integration fixtures across transport and cross-capability journeys.",
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
    invariants: [
      "Commit append-only audit events inside the owning command transaction with authenticated authorship.",
    ],
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
    adapters: ["capabilities/*/business/src/server/persistence/schema.ts"],
    docs: [
      "docs/guides/database.md",
      "docs/foundations/architecture.md#consistent-changes-and-recovery",
      "docs/guides/architecture-checks.md#connect-capabilities-through-declared-integrations",
    ],
    decisions: ["docs/decisions/0006-postgresql-and-drizzle.md"],
    invariants: [
      "Inspect generated SQL migrations for surrogate/public IDs, covering FK indexes, enum CHECKs, and no edits to applied migrations.",
      "Import shared Drizzle column and constraint builders from @merit/db/schema rather than redefining them locally.",
    ],
  },
  {
    id: "drafts-and-recovery",
    summary: "IndexedDB draft recovery, save-vs-refresh state separation, and focus preservation.",
    contracts: [
      "foundation/drafts/src/**",
      "foundation/query/src/**",
      "foundation/ui/src/patterns/editing/**",
    ],
    adapters: [
      "capabilities/*/web/src/controllers/**",
      "capabilities/*/web/src/views/**",
      "interfaces/*/src/**/controllers/**",
    ],
    docs: [
      "foundation/drafts/README.md",
      "foundation/query/README.md",
      "docs/guides/web-features.md#preserve-the-result-of-an-action",
      "foundation/ui/src/patterns/editing/editing.mdx",
    ],
    decisions: ["docs/decisions/0004-tanstack.md"],
    invariants: [
      "Keep reference material and reading position intact across close, resume, task switching, and keyboard return.",
      "Preserve moved focus on delayed saves, align conflict records on both sides, and show changed values before snapshots.",
      "Keep whole-section values passive until edit begins, without row-level edit controls, separating staff notes from answers.",
    ],
  },
  {
    id: "exact-money",
    summary:
      "Integer minor-unit (bigint) monetary arithmetic, validation, encoding, and formatting.",
    contracts: ["foundation/money/src/**", "foundation/ui/src/components/fields/money-field/**"],
    adapters: [],
    docs: ["foundation/money/README.md"],
    decisions: ["docs/decisions/0008-money.md"],
    invariants: [
      "Store committed money in integer EUR minor units (bigint) and reject excess precision on input and paste.",
    ],
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
    invariants: [
      "Enforce the same capability preconditions, tenant scope, and error containment in MCP tools as on web.",
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
    invariants: [
      "Build demo workspaces through capability example builders and keep them isolated from standard workspaces.",
    ],
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
    invariants: [
      "Sanitize PII and location fields before emission, and verify retries, failures, and demo traffic fit the signal's decision.",
    ],
  },
  {
    id: "background-work",
    summary: "Temporal workflows coordinate background work; PostgreSQL stays the source of truth.",
    contracts: ["foundation/workflows/src/**"],
    adapters: ["app/src/worker/**"],
    docs: ["foundation/workflows/README.md"],
    decisions: ["docs/decisions/0016-temporal-background-work.md"],
    invariants: [
      "Keep workflow code deterministic and payloads to record identifiers, all encrypted by the payload codec.",
    ],
  },
  {
    id: "shared-ui-patterns",
    summary:
      "Shared @merit/ui tokens, React Aria controls, layout patterns, and Storybook baselines.",
    contracts: ["foundation/ui/src/**", "foundation/forms/src/**", "foundation/tables/src/**"],
    adapters: [
      "capabilities/*/web/src/views/**",
      "interfaces/product/src/**",
      "interfaces/admin/src/**",
      "**/*.stories.tsx",
    ],
    docs: [
      "foundation/ui/README.md",
      "docs/guides/ui.md#compose-and-style-a-feature",
      "docs/guides/ui-verification.md",
      "docs/guides/storybook.md#set-up-an-inspectable-state",
    ],
    decisions: ["docs/decisions/0005-design-system.md"],
    invariants: [
      "Close navigation popups on history changes, move focus cleanly when controls disappear, and keep compact headers reachable.",
      "Match isolated stories to connected task placement with synthetic test controls visibly outside the product frame.",
      "Match UI precedent in hierarchy and framing, with one outcome heading, preserved draft, and one action hierarchy on desktop/mobile.",
    ],
  },
];
