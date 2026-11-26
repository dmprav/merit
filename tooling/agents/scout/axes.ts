/** What a scout reads about one rotation target: its scope, the docs that anchor it, and what to look for. */
export type RotationAxisDescription = {
  id: string;
  summary: string;
  anchorDocs: readonly string[];
  pathPatterns: readonly string[];
  focus: string;
};

/** Telemetry an axis needs beyond its lens's structural defaults. */
export type AxisTelemetry = {
  /** Measures eager versus deferred weight per bundle entry. */
  entryWeights?: true;
  /** Lists the files holding the most lint, fallow, and type-check suppressions. */
  suppressionTopFiles?: true;
};

export type RotationAxis = RotationAxisDescription & { telemetry?: AxisTelemetry };

/** Drops the telemetry flags, which steer collection but are not part of the scout context. */
export const describeRotationAxis = ({
  id,
  summary,
  anchorDocs,
  pathPatterns,
  focus,
}: RotationAxis): RotationAxisDescription => ({ id, summary, anchorDocs, pathPatterns, focus });

export const ARCHITECTURE_AXES: readonly RotationAxis[] = [
  {
    id: "capability-ownership-and-boundaries",
    summary: "Grant-work capability boundaries, cross-capability wiring, and server composition.",
    anchorDocs: [
      "docs/foundations/architecture.md",
      "tooling/verification/architecture/config.ts",
      "app/src/server/services.server.ts",
    ],
    pathPatterns: [
      "capabilities/*/business/src/server/**",
      "app/src/server/services.server.ts",
      "tooling/verification/architecture/config.ts",
    ],
    focus:
      "Ownership leaks across rounds/applications/reviews/recommendations + grantmaking composition, serverImports exception creep, shared-persistence leaks, and orchestration accumulating in services.server.ts.",
  },
  {
    id: "web-layering-and-draft-recovery",
    summary: "Web view/controller layering, save-vs-refresh separation, and draft recovery.",
    anchorDocs: [
      "docs/foundations/architecture.md",
      "docs/guides/web-features.md",
      "tooling/verification/architecture/mechanisms.config.ts",
    ],
    pathPatterns: [
      "foundation/drafts/src/**",
      "foundation/query/src/**",
      "foundation/ui/src/patterns/editing/**",
      "capabilities/*/web/src/**",
      "interfaces/product/src/features/**/data/**",
    ],
    focus:
      "Views absorbing controller/domain state, save-vs-refresh separation drift, and inconsistent IndexedDB draft or revision-baseline recovery across capabilities.",
  },
  {
    id: "interface-transport-and-routing",
    summary: "App router/bundle boundaries, server function adapters, and route loaders.",
    anchorDocs: [
      "docs/foundations/architecture.md",
      "app/src/router.tsx",
      "interfaces/product/src/features/grantmaking/page-routing.ts",
    ],
    pathPatterns: [
      "app/src/**",
      "interfaces/*/src/routes/**",
      "interfaces/*/src/features/**/data/server/**",
      "interfaces/product/src/features/grantmaking/page-routing.ts",
      "interfaces/emails/src/**",
    ],
    focus:
      "Eager router/bundle weight, repeated server-function adapter boilerplate across product and admin, and route loader/redirect/error-translation drift.",
    telemetry: { entryWeights: true },
  },
  {
    id: "shared-ui-and-design-system-contracts",
    summary: "Shared UI primitives, form/table adapters, and exact money/date contracts.",
    anchorDocs: [
      "docs/foundations/architecture.md",
      "tooling/verification/architecture/mechanisms.config.ts",
      "docs/decisions/0008-money.md",
    ],
    pathPatterns: [
      "foundation/ui/src/**",
      "foundation/forms/src/**",
      "foundation/tables/src/**",
      "foundation/money/src/**",
      "foundation/dates/src/**",
      "capabilities/*/web/src/views/**",
      "interfaces/*/src/**",
    ],
    focus:
      "Feature views bypassing @merit/ui, @merit/forms, or @merit/tables, duplicated UI patterns across >=2 capabilities, React Aria focus/dismissal drift, and money/date boundary inconsistencies.",
  },
  {
    id: "audit-demo-and-observability-mechanisms",
    summary: "Audit trail, demo lifecycle seeding, and telemetry/analytics consistency.",
    anchorDocs: [
      "tooling/verification/architecture/mechanisms.config.ts",
      "app/src/server/services.server.ts",
      "capabilities/audit/business/README.md",
    ],
    pathPatterns: [
      "capabilities/audit/business/src/**",
      "capabilities/*/business/src/server/demo.ts",
      "app/src/server/demo*",
      "foundation/telemetry/src/**",
      "foundation/analytics/src/**",
      "app/src/server/services.server.ts",
    ],
    focus:
      "Write-owning capabilities drifting on audit-event recording or snapshot fidelity, demo seeders diverging from capability example builders, and inconsistent instrumentService/reportError/analytics wiring.",
  },
  {
    id: "enforcement-ladder-and-verification-gaps",
    summary:
      "Escalating recurring prose/review rules into static checks and shrinking suppressions.",
    anchorDocs: [
      "docs/foundations/principles.md",
      "docs/guides/verification-tooling.md",
      ".agents/skills/build-feature/review.md",
      "AGENTS.md",
    ],
    pathPatterns: [
      "tooling/verification/**",
      ".fallowrc.jsonc",
      "docs/guides/verification-tooling.md",
      ".agents/skills/build-feature/review.md",
      "AGENTS.md",
    ],
    focus:
      "Recurring prose or review-rubric rules that should move up into lint, TypeScript boundaries, fallow, mechanisms.config.ts, or architecture tests, plus oxlint-disable and fallow override creep.",
    telemetry: { suppressionTopFiles: true },
  },
];

export const SIMPLIFICATION_LAYERS: readonly RotationAxis[] = [
  {
    id: "business-server",
    summary: "Capability business domain, server services, and persistence queries/commands.",
    anchorDocs: ["docs/guides/coding-conventions.md", "docs/foundations/principles.md"],
    pathPatterns: ["capabilities/*/business/src/**", "app/src/server/**"],
    focus:
      "Duplicated query/command helpers, repeated persistence mapping across capabilities, and dead indirection in server modules without changing capability boundaries.",
  },
  {
    id: "web-views-and-controllers",
    summary: "Capability web controllers, data hooks, and views.",
    anchorDocs: ["docs/guides/coding-conventions.md", "docs/guides/web-features.md"],
    pathPatterns: ["capabilities/*/web/src/**"],
    focus:
      "Repeated controller/view boilerplate, unused wrappers, and copy-pasted form/table/state wiring that can reuse existing shared abstractions.",
  },
  {
    id: "interfaces-and-routes",
    summary: "Product, admin, site, email, and MCP interface layers and routes.",
    anchorDocs: ["docs/guides/coding-conventions.md", "docs/foundations/architecture.md"],
    pathPatterns: ["interfaces/*/src/**", "app/src/**"],
    focus:
      "Repeated route shells, duplicated server-function glue, and copy-pasted loader/adapter helpers across interfaces.",
  },
  {
    id: "foundation-and-tooling",
    summary: "Shared foundation packages and repository tooling.",
    anchorDocs: ["docs/guides/coding-conventions.md", "docs/foundations/principles.md"],
    pathPatterns: ["foundation/*/src/**", "tooling/**"],
    focus:
      "Duplicated UI/table/form/utility code across foundation packages and dead or overlapping helpers in repository tooling.",
  },
];
