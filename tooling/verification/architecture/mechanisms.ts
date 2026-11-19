import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

export const MAX_SUMMARY_LENGTH = 120;

export const mechanismSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().min(1),
  owners: z.array(z.string().min(1)).min(1),
  contractPaths: z.array(z.string().min(1)).min(1),
  triggerImports: z.array(z.string().min(1)),
  docs: z.array(z.string().min(1)).min(1),
  decisions: z.array(z.string().min(1)),
  vetoes: z.array(z.string().min(1)).min(1),
  escapes: z.array(z.string().min(1)),
});

export type Mechanism = z.infer<typeof mechanismSchema>;

export type MechanismImpact = "extends" | "composes";

export type MatchedMechanism = {
  mechanism: Mechanism;
  impact: MechanismImpact;
  matchedOwners: string[];
  matchedImports: string[];
};

export type MechanismClassification = {
  risk: "none" | MechanismImpact;
  paths: string[];
  matched: MatchedMechanism[];
};

/**
 * Cross-cutting architectural mechanisms whose owners, invariants, decisions,
 * and escaped defect checks apply across capabilities and interfaces.
 */
export const MECHANISMS: readonly Mechanism[] = [
  {
    id: "authorization-policy",
    summary:
      "Single policy table evaluated in TypeScript and SQL with current server facts and locks.",
    owners: [
      "capabilities/access/",
      "foundation/auth/",
      "capabilities/organizations/business/src/server/persistence/scope.ts",
    ],
    contractPaths: [
      "capabilities/access/src/",
      "foundation/auth/src/",
      "capabilities/organizations/business/src/server/persistence/scope.ts",
    ],
    triggerImports: ["@merit/access", "@merit/access/scope", "@merit/auth"],
    docs: [
      "capabilities/access/README.md",
      "docs/foundations/architecture.md#authority-across-interfaces",
    ],
    decisions: [
      "docs/decisions/0007-clerk.md",
      "docs/decisions/0011-shared-authorization-policy.md",
    ],
    vetoes: [
      "Never trust tool arguments, browser input, or cached token claims over current server membership and account state.",
      "Never introduce precomputed canRead booleans or separate SQL predicates detached from @merit/access.",
    ],
    escapes: [
      "When authorization prerequisites change, establish them in all integration fixtures that call affected operations, including transport and cross-capability journeys.",
      "After removing and restoring membership, verify pending invitations and accepted assignments remain inaccessible until explicitly reinstated.",
    ],
  },
  {
    id: "audit-trail",
    summary:
      "Append-only workspace activity events committed inside the owning command transaction.",
    owners: ["capabilities/audit/business/"],
    contractPaths: [
      "capabilities/audit/business/src/domain/",
      "capabilities/audit/business/src/server/",
    ],
    triggerImports: [
      "@merit/audit/server/record",
      "@merit/audit/server/read",
      "@merit/audit/schema",
      "@merit/audit/api",
      "@merit/audit/server/demo",
    ],
    docs: ["capabilities/audit/business/README.md"],
    decisions: ["docs/decisions/0006-postgresql-and-drizzle.md"],
    vetoes: [
      "Never mutate or delete audit_events outside expired demo cleanup, or fabricate web provenance for unknown seed history.",
      "Never omit recordAuditEvent from an accepted workspace command or swallow its failure inside the transaction.",
    ],
    escapes: [
      "Verify conflict and history comparisons align the same record and fields on both sides and identify changed values before showing snapshots, keeping unknown historical basis unknown.",
      "Keep complete historical records on one consistent label/value treatment with staff interpretation separate from applicant responses.",
    ],
  },
  {
    id: "locks-and-transactions",
    summary:
      "Shared database transactions, grant-work lock order, and assembly-wired lifecycle hooks.",
    owners: [
      "foundation/db/",
      "capabilities/organizations/business/src/server/persistence/commands/locks.ts",
      "capabilities/organizations/business/src/server/persistence/member-transactions.ts",
    ],
    contractPaths: [
      "foundation/db/src/",
      "foundation/db/database/",
      "capabilities/organizations/business/src/server/persistence/commands/locks.ts",
      "capabilities/organizations/business/src/server/persistence/member-transactions.ts",
      "capabilities/*/business/src/server/grant-work.ts",
      "capabilities/*/business/src/server/integrations.ts",
    ],
    triggerImports: [
      "@merit/db",
      "@merit/organizations/locks",
      "@merit/organizations/transactions",
      "server/grant-work",
      "server/integrations",
    ],
    docs: [
      "docs/foundations/architecture.md#consistent-changes-and-recovery",
      "docs/guides/architecture-checks.md#connect-capabilities-through-declared-integrations",
    ],
    decisions: ["docs/decisions/0006-postgresql-and-drizzle.md"],
    vetoes: [
      "Never acquire cross-capability locks out of shared order or release command locks before commit.",
      "Never introduce reverse capability dependencies instead of assembly-supplied grant-work or integration contracts.",
    ],
    escapes: [
      "Verify rejected writes, missing locks, and audit insert failures roll back business state, receipts, and events together.",
    ],
  },
  {
    id: "drafts-and-recovery",
    summary: "IndexedDB draft recovery, save-vs-refresh state separation, and focus preservation.",
    owners: ["foundation/drafts/", "foundation/query/", "foundation/ui/src/patterns/editing/"],
    contractPaths: [
      "foundation/drafts/src/",
      "foundation/query/src/",
      "foundation/ui/src/patterns/editing/",
      "capabilities/*/web/src/controllers/",
      "interfaces/*/src/**/controllers/",
    ],
    triggerImports: ["@merit/drafts", "@merit/query", "@merit/ui/editor-loading"],
    docs: [
      "foundation/drafts/README.md",
      "foundation/query/README.md",
      "docs/guides/web-features.md#preserve-the-result-of-an-action",
      "foundation/ui/src/patterns/editing/editing.mdx",
    ],
    decisions: ["docs/decisions/0004-tanstack.md"],
    vetoes: [
      "Never store drafts in localStorage or sessionStorage, repeat a committed write when retrying refresh, or mount editors before drafts.ready.",
      "Never overwrite or discard a stale draft silently before explicit user reconciliation.",
    ],
    escapes: [
      "Keep navigation popups closing on browser history changes, preserve focus across delayed saves and control teardown, and keep reference material readable without losing draft or reading position.",
      "Keep whole-section values passive until the section edit action is used, without parallel row-level edit controls.",
      "Wait for observable readiness in tests before interacting with restored drafts or capturing animated scroll position.",
    ],
  },
  {
    id: "exact-money",
    summary:
      "Integer minor-unit (bigint) monetary arithmetic, validation, encoding, and formatting.",
    owners: ["foundation/money/"],
    contractPaths: ["foundation/money/src/"],
    triggerImports: ["@merit/money", "@merit/ui/money-field"],
    docs: ["foundation/money/README.md"],
    decisions: ["docs/decisions/0008-money.md"],
    vetoes: [
      "Never convert monetary amounts to JavaScript number or floats, even for display or sorting.",
      "Never round extra user decimal places silently or serialize raw bigint values without encodeMoney/decodeMoney.",
    ],
    escapes: [
      "Verify invalid precision inputs are rejected without rounding and allocation remainders are assigned deterministically.",
    ],
  },
  {
    id: "delegated-mcp",
    summary: "OAuth-scoped MCP tools enforcing capability preconditions and web parity.",
    owners: ["interfaces/mcp/"],
    contractPaths: [
      "interfaces/mcp/src/components/",
      "interfaces/mcp/src/app/",
      "capabilities/*/business/src/api/",
    ],
    triggerImports: ["@merit/mcp"],
    docs: [
      "interfaces/mcp/README.md",
      "docs/guides/mcp.md",
      "docs/foundations/architecture.md#authority-across-interfaces",
    ],
    decisions: [
      "docs/decisions/0010-mcp-delegated-authority.md",
      "docs/decisions/0011-shared-authorization-policy.md",
    ],
    vetoes: [
      "Never diverge business rules or authority checks between web and MCP, or bypass register-tool.ts scope and output validation.",
      "Never depend on union schema array ordering for tool semantics.",
    ],
    escapes: [
      "Verify MCP tests assert real business outcomes, original revision preconditions, and verified actor/client attribution independently of registration tables.",
    ],
  },
  {
    id: "demo-lifecycle",
    summary:
      "Isolated disposable PostgreSQL demo workspaces built from capability example builders.",
    owners: [
      "app/src/server/demo.server.ts",
      "app/src/server/demo-workspace.server.ts",
      "app/scripts/clean-demos.ts",
    ],
    contractPaths: [
      "app/src/server/demo.server.ts",
      "app/src/server/demo-workspace.server.ts",
      "app/scripts/clean-demos.ts",
      "capabilities/*/business/src/server/demo.ts",
    ],
    triggerImports: ["/server/demo"],
    docs: ["docs/guides/development.md#demo-lifecycle-checks-and-cleanup"],
    decisions: ["docs/decisions/0009-demo-workspaces.md"],
    vetoes: [
      "Never maintain a separate browser-local demo simulation instead of ordinary workspaces and capability operations.",
      "Never delete non-demo workspaces or bypass removeDemoAudit during expired demo cleanup.",
    ],
    escapes: [
      "Verify demo isolation per visitor, concurrent starts, reset retries, expiry rollback, and cleanup without touching standard workspaces.",
    ],
  },
  {
    id: "telemetry-and-analytics",
    summary:
      "Sanitized OpenTelemetry tracing, reportError boundary, and cookieless PostHog analytics.",
    owners: ["foundation/telemetry/", "foundation/analytics/"],
    contractPaths: ["foundation/telemetry/src/", "foundation/analytics/src/"],
    triggerImports: [
      "@merit/telemetry",
      "@merit/telemetry/errors",
      "@merit/telemetry/server",
      "@merit/analytics",
      "@merit/analytics/posthog",
    ],
    docs: ["foundation/telemetry/README.md", "foundation/analytics/README.md"],
    decisions: [
      "docs/decisions/0012-opentelemetry-checkly.md",
      "docs/decisions/0013-error-reporting-boundary.md",
      "docs/decisions/0014-posthog-analytics.md",
    ],
    vetoes: [
      "Never import @opentelemetry/* or posthog-js outside foundation/telemetry and foundation/analytics, or use ad-hoc console.error instead of reportError.",
      "Never attach grant content, emails, invitation/OAuth tokens, workspace slugs, or record IDs to spans or analytics events.",
    ],
    escapes: [
      "Verify route labels and analytics paths strip identifiers, slugs, and tokens before leaving the server or browser.",
    ],
  },
  {
    id: "shared-ui-patterns",
    summary:
      "Shared @merit/ui tokens, React Aria controls, layout patterns, and Storybook baselines.",
    owners: ["foundation/ui/", "foundation/forms/", "foundation/tables/"],
    contractPaths: ["foundation/ui/src/", "foundation/forms/src/", "foundation/tables/src/"],
    triggerImports: ["@merit/ui", "@merit/forms", "@merit/tables"],
    docs: [
      "foundation/ui/README.md",
      "docs/guides/ui.md#compose-and-style-a-feature",
      "docs/guides/ui-verification.md",
    ],
    decisions: ["docs/decisions/0005-design-system.md"],
    vetoes: [
      "Never copy shared controls locally instead of extending @merit/ui, or bypass design tokens with hardcoded colors or spacing.",
      "Never place synthetic test controls inside the product frame.",
    ],
    escapes: [
      "Compare desktop and narrow screens across outcome, confirmation, and recovery states with one clear action hierarchy and keyboard focus restoration.",
      "Keep judgments visually distinguishing outcomes, qualifications, and attribution, and keep compact headers preserving visibly labeled next actions.",
    ],
  },
];

const normalizePath = (value: string) => value.replaceAll("\\", "/").replace(/^\.\//, "");

/** Converts a Markdown heading to the GitHub/remark anchor slug used in doc links. */
const slugifyHeading = (heading: string) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~()[\]<>.,:;!?'"]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const collectMarkdownAnchors = (content: string) => {
  const anchors = new Set<string>();
  let inFence = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = /^ {0,3}#{1,6}\s+(.+?)\s*#*$/.exec(line);
    if (match?.[1]) {
      anchors.add(slugifyHeading(match[1]));
    }
  }
  return anchors;
};

const isSupersededDecision = (content: string) => {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const statusMatch = /^\*?\*?status:?\*?\*?\s*(.*)$/i.exec(line);
    if (statusMatch?.[1]) {
      return /^superseded\b/i.test(statusMatch[1]);
    }
    return /^superseded\b/i.test(line);
  }
  return false;
};

const checkPathReference = (repoRoot: string, ref: string): string | null => {
  const [rawFilePath, anchor] = ref.split("#");
  const filePath = rawFilePath ?? "";
  if (!filePath) {
    return "empty file reference";
  }

  if (filePath.includes("*")) {
    const prefix = filePath.split("*")[0] ?? "";
    if (!prefix || !existsSync(join(repoRoot, prefix.replace(/\/$/, "")))) {
      return `wildcard root does not exist: ${filePath}`;
    }
    return null;
  }

  const target = join(repoRoot, filePath.replace(/\/$/, ""));
  if (!existsSync(target)) {
    return `path does not exist on disk: ${filePath}`;
  }

  if (filePath.endsWith("/") && !statSync(target).isDirectory()) {
    return `expected directory for trailing-slash path: ${filePath}`;
  }

  if (anchor) {
    if (!statSync(target).isFile()) {
      return `anchor target is not a file: ${ref}`;
    }
    const anchors = collectMarkdownAnchors(readFileSync(target, "utf8"));
    if (!anchors.has(anchor)) {
      return `missing heading anchor #${anchor} in ${filePath}`;
    }
  }

  return null;
};

export const validateMechanismMap = (
  mechanisms: readonly Mechanism[],
  repoRoot: string,
): string[] => {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const raw of mechanisms) {
    const parsed = mechanismSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`invalid mechanism schema (${raw.id}): ${parsed.error.message}`);
      continue;
    }
    const mech = parsed.data;
    if (seenIds.has(mech.id)) {
      errors.push(`duplicate mechanism id: ${mech.id}`);
    }
    seenIds.add(mech.id);

    if (mech.summary.includes("\n")) {
      errors.push(`${mech.id}: summary must be a single line`);
    }
    if (mech.summary.length > MAX_SUMMARY_LENGTH) {
      errors.push(
        `${mech.id}: summary is ${mech.summary.length} chars (max ${MAX_SUMMARY_LENGTH})`,
      );
    }

    for (const owner of mech.owners) {
      const issue = checkPathReference(repoRoot, owner);
      if (issue) {
        errors.push(`${mech.id} owner "${owner}": ${issue}`);
      }
    }

    for (const contract of mech.contractPaths) {
      const issue = checkPathReference(repoRoot, contract);
      if (issue) {
        errors.push(`${mech.id} contractPath "${contract}": ${issue}`);
      }
    }

    for (const doc of mech.docs) {
      const issue = checkPathReference(repoRoot, doc);
      if (issue) {
        errors.push(`${mech.id} doc "${doc}": ${issue}`);
      }
    }

    for (const decision of mech.decisions) {
      const issue = checkPathReference(repoRoot, decision);
      if (issue) {
        errors.push(`${mech.id} decision "${decision}": ${issue}`);
        continue;
      }
      const content = readFileSync(join(repoRoot, decision), "utf8");
      if (isSupersededDecision(content)) {
        errors.push(`${mech.id} decision "${decision}" is superseded; link its replacement`);
      }
    }
  }

  return errors;
};

const patternToRegex = (pattern: string) => {
  const normalized = normalizePath(pattern);
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__GLOBSTAR__")
    .replace(/\*/g, "[^/]+")
    .replace(/__GLOBSTAR__/g, ".*");
  if (normalized.endsWith("/")) {
    return new RegExp(`^${escaped}`);
  }
  return new RegExp(`^${escaped}(?:$|/)`);
};

const matchesAnyPattern = (filePath: string, patterns: readonly string[]) =>
  patterns.some((pattern) => patternToRegex(pattern).test(filePath));

const stripComments = (content: string) =>
  content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const extractImports = (content: string) => {
  const specifiers: string[] = [];
  const cleaned = stripComments(content);
  const pattern =
    /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^"'`\n;]*(?:\n[^"'`\n;]*)*?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of cleaned.matchAll(pattern)) {
    const spec = match[1] ?? match[2];
    if (spec) {
      specifiers.push(spec);
    }
  }
  return specifiers;
};

const matchesTriggerImport = (specifier: string, trigger: string) =>
  trigger.startsWith("/")
    ? specifier.includes(trigger)
    : specifier === trigger || specifier.startsWith(`${trigger}/`);

export const classifyChangedPaths = ({
  paths,
  mechanisms = MECHANISMS,
  readSource,
}: {
  paths: readonly string[];
  mechanisms?: readonly Mechanism[];
  readSource?: (path: string) => string | undefined;
}): MechanismClassification => {
  const normalizedPaths = paths.map(normalizePath).filter(Boolean);
  const sourceImports = new Map<string, string[]>();

  if (readSource) {
    for (const filePath of normalizedPaths) {
      if (!/\.(?:[cm]?[jt]sx?)$/.test(filePath)) {
        continue;
      }
      const content = readSource(filePath);
      if (content !== undefined) {
        sourceImports.set(filePath, extractImports(content));
      }
    }
  }

  const matched: MatchedMechanism[] = [];

  for (const mechanism of mechanisms) {
    const matchedOwners = normalizedPaths.filter((p) => matchesAnyPattern(p, mechanism.owners));
    const matchedContracts = normalizedPaths.filter((p) =>
      matchesAnyPattern(p, mechanism.contractPaths),
    );
    const matchedImports = new Set<string>();

    for (const [filePath, specifiers] of sourceImports) {
      for (const spec of specifiers) {
        if (mechanism.triggerImports.some((trigger) => matchesTriggerImport(spec, trigger))) {
          matchedImports.add(`${filePath} -> ${spec}`);
        }
      }
    }

    if (matchedOwners.length === 0 && matchedContracts.length === 0 && matchedImports.size === 0) {
      continue;
    }

    const impact: MechanismImpact = matchedContracts.length > 0 ? "extends" : "composes";
    matched.push({
      mechanism,
      impact,
      matchedOwners: [...new Set([...matchedOwners, ...matchedContracts])].sort(),
      matchedImports: [...matchedImports].sort(),
    });
  }

  const risk = matched.some((entry) => entry.impact === "extends")
    ? "extends"
    : matched.length > 0
      ? "composes"
      : "none";

  return { risk, paths: normalizedPaths, matched };
};

export const formatMechanismReport = (classification: MechanismClassification) => {
  if (classification.matched.length === 0) {
    return `mechanisms: risk=none (${classification.paths.length} path(s), no cross-cutting mechanisms matched)`;
  }

  const lines = [
    `mechanisms: risk=${classification.risk} (${classification.matched.length} mechanism(s) matched across ${classification.paths.length} path(s))`,
  ];

  for (const entry of classification.matched) {
    const { mechanism } = entry;
    lines.push("", `- ${mechanism.id} [${entry.impact}] — ${mechanism.summary}`);
    for (const owner of entry.matchedOwners) {
      lines.push(`    path: ${owner}`);
    }
    for (const imp of entry.matchedImports) {
      lines.push(`    import: ${imp}`);
    }
    lines.push(`    docs: ${mechanism.docs.join(", ")}`);
    if (mechanism.decisions.length > 0) {
      lines.push(`    decisions: ${mechanism.decisions.join(", ")}`);
    }
    for (const veto of mechanism.vetoes) {
      lines.push(`    veto: ${veto}`);
    }
    for (const escape of mechanism.escapes) {
      lines.push(`    escape: ${escape}`);
    }
  }

  return lines.join("\n");
};

const readFlagValues = (args: readonly string[], flag: string) => {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return null;
  }
  const values: string[] = [];
  for (const arg of args.slice(idx + 1)) {
    if (arg.startsWith("--")) {
      break;
    }
    values.push(arg);
  }
  return values;
};

const runCli = () => {
  const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const args = process.argv.slice(2);
  const baseValues = readFlagValues(args, "--base");
  const headValues = readFlagValues(args, "--head");
  const explicitPaths = readFlagValues(args, "--paths");
  const jsonOut = args.includes("--json");

  if (args.includes("--check") || (!baseValues && !explicitPaths)) {
    const errors = validateMechanismMap(MECHANISMS, repoRoot);
    if (errors.length > 0) {
      console.error(`mechanisms check failed (${errors.length} problem(s)):`);
      for (const error of errors) {
        console.error(`  - ${error}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`mechanisms ok (${MECHANISMS.length} cross-cutting mechanisms)`);
    return;
  }

  let paths: string[];
  if (explicitPaths) {
    paths = explicitPaths;
  } else {
    const base = baseValues?.[0] ?? "origin/main";
    const head = headValues?.[0] ?? "HEAD";
    const raw = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    paths = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const classification = classifyChangedPaths({
    paths,
    mechanisms: MECHANISMS,
    readSource: (relPath) => {
      const abs = join(repoRoot, relPath);
      return existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, "utf8") : undefined;
    },
  });

  if (jsonOut) {
    console.log(JSON.stringify(classification, null, 2));
    return;
  }
  console.log(formatMechanismReport(classification));
};

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli();
}
