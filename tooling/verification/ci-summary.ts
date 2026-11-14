import { appendFileSync, existsSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const playwrightErrorSchema = z.object({ message: z.string().optional() });

const playwrightResultSchema = z.object({
  status: z.string(),
  duration: z.number().optional(),
  error: playwrightErrorSchema.optional(),
  errors: z.array(playwrightErrorSchema).optional(),
});

const playwrightTestSchema = z.object({
  projectName: z.string().optional(),
  status: z.string(),
  results: z.array(playwrightResultSchema).default([]),
});

const playwrightSpecSchema = z.object({
  title: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
  tests: z.array(playwrightTestSchema).default([]),
});

type PlaywrightSuite = {
  title?: string;
  file?: string;
  specs?: Array<z.infer<typeof playwrightSpecSchema>>;
  suites?: PlaywrightSuite[];
};

const playwrightSuiteSchema: z.ZodType<PlaywrightSuite> = z.lazy(() =>
  z.object({
    title: z.string().optional(),
    file: z.string().optional(),
    specs: z.array(playwrightSpecSchema).optional(),
    suites: z.array(playwrightSuiteSchema).optional(),
  }),
);

const playwrightReportSchema = z.object({
  suites: z.array(playwrightSuiteSchema).default([]),
  errors: z.array(playwrightErrorSchema).default([]),
  stats: z.object({
    duration: z.number().default(0),
    expected: z.number().default(0),
    skipped: z.number().default(0),
    unexpected: z.number().default(0),
    flaky: z.number().default(0),
  }),
});

const vitestAssertionSchema = z.object({
  fullName: z.string().optional(),
  title: z.string(),
  status: z.string(),
  failureMessages: z.array(z.string()).default([]),
});

const vitestFileSchema = z.object({
  name: z.string(),
  status: z.string(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  message: z.string().optional(),
  assertionResults: z.array(vitestAssertionSchema).default([]),
});

const vitestReportSchema = z.object({
  numTotalTests: z.number().default(0),
  numPassedTests: z.number().default(0),
  numFailedTests: z.number().default(0),
  numPendingTests: z.number().default(0),
  numTodoTests: z.number().default(0),
  startTime: z.number().optional(),
  success: z.boolean().default(true),
  testResults: z.array(vitestFileSchema).default([]),
});

export type SummaryFinding = {
  kind: "failed" | "flaky";
  title: string;
  location?: string;
  message?: string;
};

export type SuiteSummary = {
  label: string;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number;
  findings: SummaryFinding[];
};

const stripAnsi = (value: string) => {
  const esc = String.fromCharCode(27);
  return value.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
};

const firstErrorLine = (messages: Array<string | undefined>) => {
  for (const raw of messages) {
    if (!raw) {
      continue;
    }
    const line = stripAnsi(raw)
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find((part) => part.length > 0);
    if (line) {
      return line.length > 180 ? `${line.slice(0, 177)}...` : line;
    }
  }
  return undefined;
};

const collectPlaywrightFindings = (
  suites: PlaywrightSuite[],
  ancestors: string[],
  findings: SummaryFinding[],
) => {
  for (const suite of suites) {
    const nextAncestors = suite.title ? [...ancestors, suite.title] : ancestors;
    for (const spec of suite.specs ?? []) {
      const location = spec.file
        ? spec.line
          ? `${spec.file}:${spec.line}`
          : spec.file
        : suite.file;
      for (const testCase of spec.tests) {
        if (testCase.status !== "unexpected" && testCase.status !== "flaky") {
          continue;
        }
        const project = testCase.projectName ? ` [${testCase.projectName}]` : "";
        const errorMessages = testCase.results.flatMap((result) => [
          result.error?.message,
          ...(result.errors?.map((entry) => entry.message) ?? []),
        ]);
        findings.push({
          kind: testCase.status === "flaky" ? "flaky" : "failed",
          title: `${[...nextAncestors, spec.title].join(" › ")}${project}`,
          location,
          message: firstErrorLine(errorMessages),
        });
      }
    }
    collectPlaywrightFindings(suite.suites ?? [], nextAncestors, findings);
  }
};

export const summarizePlaywrightReport = (raw: unknown, label = "Playwright"): SuiteSummary => {
  const report = playwrightReportSchema.parse(raw);
  const findings: SummaryFinding[] = [];
  collectPlaywrightFindings(report.suites, [], findings);
  for (const error of report.errors) {
    findings.push({
      kind: "failed",
      title: "Runner setup failure",
      message: firstErrorLine([error.message]),
    });
  }
  const failed = report.stats.unexpected > 0 ? report.stats.unexpected : report.errors.length;
  return {
    label,
    passed: report.stats.expected,
    failed,
    flaky: report.stats.flaky,
    skipped: report.stats.skipped,
    durationMs: report.stats.duration,
    findings,
  };
};

export const summarizeVitestReport = (
  raw: unknown,
  label = "Vitest",
  workspaceRoot = process.cwd(),
): SuiteSummary => {
  const report = vitestReportSchema.parse(raw);
  const findings: SummaryFinding[] = [];
  let maxEnd = 0;

  for (const file of report.testResults) {
    if (file.endTime && file.endTime > maxEnd) {
      maxEnd = file.endTime;
    }
    const relPath = relative(workspaceRoot, file.name) || file.name;
    let fileAssertionFailures = 0;
    for (const assertion of file.assertionResults) {
      if (assertion.status === "failed") {
        fileAssertionFailures += 1;
        findings.push({
          kind: "failed",
          title: assertion.fullName ?? assertion.title,
          location: relPath,
          message: firstErrorLine(assertion.failureMessages),
        });
      }
    }
    if (file.status === "failed" && fileAssertionFailures === 0) {
      findings.push({
        kind: "failed",
        title: `Suite failure: ${relPath}`,
        location: relPath,
        message: firstErrorLine([file.message]),
      });
    }
  }

  const durationMs = report.startTime && maxEnd > report.startTime ? maxEnd - report.startTime : 0;

  return {
    label,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    flaky: 0,
    skipped: report.numPendingTests + report.numTodoTests,
    durationMs,
    findings,
  };
};

export const formatDuration = (durationMs: number) => {
  if (durationMs <= 0) {
    return "0.0s";
  }
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
};

const escapeMarkdownCell = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export const formatSummaryMarkdown = (title: string, summaries: SuiteSummary[]) => {
  if (summaries.length === 0) {
    return `### ${title}\n\nNo structured test reports were produced for this job.\n`;
  }

  const lines = [
    `### ${title}`,
    "",
    "| Suite | Passed | Failed | Flaky | Skipped | Duration |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const summary of summaries) {
    lines.push(
      `| ${escapeMarkdownCell(summary.label)} | ${summary.passed} | ${summary.failed} | ${summary.flaky} | ${summary.skipped} | ${formatDuration(summary.durationMs)} |`,
    );
  }

  const allFindings = summaries.flatMap((summary) => summary.findings);
  if (allFindings.length > 0) {
    lines.push("", "#### Failed and flaky tests", "");
    const shown = allFindings.slice(0, 25);
    for (const finding of shown) {
      const badge = finding.kind === "flaky" ? "FLAKY" : "FAILED";
      const loc = finding.location ? ` (\`${finding.location}\`)` : "";
      const detail = finding.message ? `: ${finding.message}` : "";
      lines.push(`- **${badge}** ${finding.title}${loc}${detail}`);
    }
    if (allFindings.length > shown.length) {
      lines.push(`- _${allFindings.length - shown.length} additional findings omitted._`);
    }
  }

  return `${lines.join("\n")}\n`;
};

const skippedScanDirs = new Set(["node_modules", ".git", "dist", ".output", ".cloudflare"]);

const findFilesByName = (rootDir: string, targetName: string): string[] => {
  if (!existsSync(rootDir)) {
    return [];
  }
  const found: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skippedScanDirs.has(entry.name)) {
          stack.push(join(current, entry.name));
        }
      } else if (entry.isFile() && entry.name === targetName) {
        found.push(join(current, entry.name));
      }
    }
  }

  return found.sort();
};

export const collectCiSummaries = (options: {
  reportDir?: string;
  scanVitestFilename?: string;
  workspaceRoot?: string;
}): SuiteSummary[] => {
  const summaries: SuiteSummary[] = [];
  const workspaceRoot = options.workspaceRoot ?? process.cwd();

  if (options.reportDir && existsSync(options.reportDir)) {
    const files = readdirSync(options.reportDir).sort();
    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const parsed: unknown = JSON.parse(readFileSync(join(options.reportDir, file), "utf8"));
      if (file.startsWith("playwright")) {
        summaries.push(summarizePlaywrightReport(parsed, basename(file, ".json")));
      } else if (file.startsWith("vitest")) {
        summaries.push(summarizeVitestReport(parsed, basename(file, ".json"), workspaceRoot));
      }
    }
  }

  if (options.scanVitestFilename) {
    const reportPaths = findFilesByName(workspaceRoot, options.scanVitestFilename);
    for (const reportPath of reportPaths) {
      const parsed: unknown = JSON.parse(readFileSync(reportPath, "utf8"));
      const pkgLabel = relative(workspaceRoot, join(reportPath, "..")) || "workspace";
      summaries.push(summarizeVitestReport(parsed, pkgLabel, workspaceRoot));
    }
  }

  return summaries;
};

const runCli = () => {
  const args = process.argv.slice(2);
  let scanVitestFilename: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--scan-vitest" && args[index + 1]) {
      scanVitestFilename = args[index + 1];
      index += 1;
    } else {
      positional.push(arg);
    }
  }

  const title = positional[0] ?? "Verification";
  const summaries = collectCiSummaries({
    reportDir: process.env.MERIT_CI_REPORT_DIR,
    scanVitestFilename,
    workspaceRoot: process.cwd(),
  });
  const markdown = formatSummaryMarkdown(title, summaries);
  process.stdout.write(markdown);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(summaryPath, `${markdown}\n`);
  }
};

const entryPath = process.argv[1];

if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  runCli();
}
