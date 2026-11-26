import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
  describeFocus,
  describeIncompleteTraversal,
  uiVerifyResultsSchema,
  type AuditedTargetResult,
  type TargetCheckResult,
  type UiVerifyResults,
} from "./results.ts";

const NOT_CHECKED = "not checked";
// A failed axe rule lists this many of its nodes.
const AXE_NODES_SHOWN = 3;

const escapeCell = (value: string): string => value.replaceAll("|", "\\|");

/** The page a route check audited when a redirect moved it away from the requested route. */
const redirectedRouteUrl = (item: TargetCheckResult): string | undefined => {
  if (item.kind !== "route" || !URL.canParse(item.url)) {
    return undefined;
  }
  const audited = new URL(item.url);
  // Resolving the bare route against the audited page would give it the destination's origin.
  const requested = new URL(item.requestedUrl ?? item.target, audited);
  if (requested.href === audited.href) {
    return undefined;
  }
  return audited.origin === requested.origin
    ? `${audited.pathname}${audited.search}${audited.hash}`
    : audited.href;
};

const formatHeader = (results: UiVerifyResults): string[] => [
  "# UI Verification Report",
  "",
  `- **Status:** ${results.passed ? "PASS" : "FAIL"}`,
  `- **Mode:** \`${results.mode}\`${results.appMode ? ` (\`${results.appMode}\`)` : ""}`,
  `- **Generated:** ${results.generatedAt}`,
  `- **Output:** \`${results.outDir}\``,
  `- **Updated:** ${results.updated ? "yes" : "no"}`,
  "",
  ...(results.error ? ["## Error", "", results.error, ""] : []),
];

const formatContainerDelegation = (results: UiVerifyResults): string[] => [
  `Delegated pixel-exact Linux visual baseline check to \`tooling/storybook/run-visual-container.ts\` (exit code: \`${results.containerExitCode ?? 1}\`).`,
  "",
];

const formatSummary = ({ summary }: UiVerifyResults): string[] => [
  "## Summary",
  "",
  `| Metric | Value |`,
  `| --- | ---: |`,
  `| Targets checked | ${summary.total} |`,
  `| Passed | ${summary.passed} |`,
  `| Failed | ${summary.failed} |`,
  `| Axe WCAG violations | ${summary.axeViolations} |`,
  `| Overflow failures | ${summary.overflowFailures} |`,
  `| Console / page errors | ${summary.browserErrors} |`,
  `| Focus indicator failures | ${summary.focusFailures} |`,
  "",
];

/** The axe, overflow, and focus cells, which a target that failed before its checks lacks. */
const checkCells = (item: TargetCheckResult): [string, string, string] => {
  if (item.status === "errored") {
    return [NOT_CHECKED, NOT_CHECKED, NOT_CHECKED];
  }
  const overflow = item.hasHorizontalOverflow
    ? `FAIL (${item.scrollWidth}>${item.innerWidth})`
    : "OK";
  const focus = describeFocus(item.focus);
  return [String(item.axeViolations.length), overflow, `${focus.verdict} (${focus.label})`];
};

const formatTargetRow = (item: TargetCheckResult, outDir: string): string => {
  const redirect = redirectedRouteUrl(item);
  const target = `\`${escapeCell(item.name)}\`${redirect ? ` → \`${escapeCell(redirect)}\`` : ""}`;
  const [axe, overflow, focus] = checkCells(item);
  const screenshot = item.screenshot
    ? `\`${relative(outDir, item.screenshot).replaceAll("\\", "/")}\``
    : "—";
  return `| ${target} | ${item.viewport} | ${item.passed ? "PASS" : "FAIL"} | ${axe} | ${overflow} | ${item.browserErrors.length} | ${focus} | ${screenshot} |`;
};

const formatTargets = (results: UiVerifyResults): string[] => [
  "## Targets",
  "",
  "| Target | Viewport | Status | Axe | Overflow | Errors | Focus | Screenshot |",
  "| --- | --- | --- | ---: | --- | ---: | --- | --- |",
  ...results.targets.map((item) => formatTargetRow(item, results.outDir)),
];

const formatPageFindings = (item: AuditedTargetResult): string[] => [
  ...(item.viteErrorOverlayCount > 0
    ? [`- **Vite error overlay:** ${item.viteErrorOverlayCount} detected`]
    : []),
  ...(item.bodyVisible ? [] : ["- **Body visibility:** document body was not visible"]),
  ...(item.dialogsVisible ? [] : ["- **Dialog visibility:** an open dialog remained transparent"]),
  ...(item.enteringOrExitingCount > 0
    ? [
        `- **Unsettled transitions:** ${item.enteringOrExitingCount} element(s) still marked entering/exiting`,
      ]
    : []),
  ...(item.hasHorizontalOverflow
    ? [
        `- **Horizontal overflow:** \`scrollWidth=${item.scrollWidth}\` > \`innerWidth=${item.innerWidth}\``,
      ]
    : []),
];

const formatAxeFindings = (item: AuditedTargetResult): string[] =>
  item.axeViolations.map((violation) => {
    const nodes = violation.nodes
      .slice(0, AXE_NODES_SHOWN)
      .map((node) => node.target.join(" "))
      .join(", ");
    return `- **Axe [${violation.impact ?? "unknown"}] \`${violation.id}\`:** ${violation.help}${nodes ? ` (${nodes})` : ""}`;
  });

const formatFocusFindings = (item: AuditedTargetResult): string[] => {
  const incomplete = describeIncompleteTraversal(item.focus);
  const traversal = item.focus.traversal;
  const capDetail =
    !traversal.complete && traversal.reason === "cap"
      ? ` (keyboard focus traversal hit the ${item.focus.stopsChecked}-stop cap before completing)`
      : "";
  return [
    ...(incomplete ? [`- **Focus traversal incomplete:** ${incomplete}${capDetail}`] : []),
    ...item.focus.failures.map(
      (failure) =>
        `- **Focus stop #${failure.stopIndex} (${failure.element}):** ${failure.reasons.join("; ")}`,
    ),
  ];
};

const formatFailure = (item: TargetCheckResult): string[] => {
  const browserErrors = item.browserErrors.map(
    (err) => `- **Browser ${err.type}:** ${err.message}`,
  );
  const findings =
    item.status === "errored"
      ? [`- **Runtime error:** ${item.error}`, ...browserErrors]
      : [
          ...formatPageFindings(item),
          ...formatAxeFindings(item),
          ...browserErrors,
          ...formatFocusFindings(item),
        ];
  return [`### \`${item.name}\` (${item.viewport})`, "", ...findings, ""];
};

const formatFailures = (results: UiVerifyResults): string[] => {
  const failed = results.targets.filter((item) => !item.passed);
  return failed.length === 0 ? [] : ["", "## Failures", "", ...failed.flatMap(formatFailure)];
};

export const formatMarkdownReport = (results: UiVerifyResults): string => {
  const sections =
    results.mode === "container"
      ? [formatHeader(results), formatContainerDelegation(results)]
      : [
          formatHeader(results),
          formatSummary(results),
          formatTargets(results),
          formatFailures(results),
        ];
  return `${sections.flat().join("\n").trimEnd()}\n`;
};

export const writeProofArtifacts = (outDir: string, results: UiVerifyResults): void => {
  mkdirSync(outDir, { recursive: true });
  const validated = uiVerifyResultsSchema.parse(results);
  writeFileSync(join(outDir, "results.json"), `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "report.md"), formatMarkdownReport(validated), "utf8");
};
