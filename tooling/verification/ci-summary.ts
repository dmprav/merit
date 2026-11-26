import { appendFileSync, existsSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { basename, join, relative } from "node:path";

import { z } from "zod";

import { parseCliArgs } from "../cli.ts";

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

/** Findings quote at most this many characters of an error's first line. */
const MAX_ERROR_LINE_LENGTH = 180;

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
      return line.length > MAX_ERROR_LINE_LENGTH
        ? `${line.slice(0, MAX_ERROR_LINE_LENGTH - 3)}...`
        : line;
    }
  }
  return undefined;
};

type PlaywrightSpec = z.infer<typeof playwrightSpecSchema>;

type PlaywrightTest = z.infer<typeof playwrightTestSchema>;

const specLocation = (spec: PlaywrightSpec, suite: PlaywrightSuite) => {
  if (!spec.file) {
    return suite.file;
  }
  return spec.line ? `${spec.file}:${spec.line}` : spec.file;
};

/** Reports a failed or flaky test, titled by its suite path, and nothing for any other outcome. */
const playwrightTestFindings = (
  testCase: PlaywrightTest,
  specTitle: string,
  location: string | undefined,
): SummaryFinding[] => {
  if (testCase.status !== "unexpected" && testCase.status !== "flaky") {
    return [];
  }
  const project = testCase.projectName ? ` [${testCase.projectName}]` : "";
  const errorMessages = testCase.results.flatMap((result) => [
    result.error?.message,
    ...(result.errors?.map((entry) => entry.message) ?? []),
  ]);
  return [
    {
      kind: testCase.status === "flaky" ? "flaky" : "failed",
      title: `${specTitle}${project}`,
      location,
      message: firstErrorLine(errorMessages),
    },
  ];
};

/** Collects failed and flaky tests depth-first: each suite's own specs before its nested suites. */
const collectPlaywrightFindings = (
  suites: readonly PlaywrightSuite[],
  ancestors: readonly string[] = [],
): SummaryFinding[] =>
  suites.flatMap((suite) => {
    const suitePath = suite.title ? [...ancestors, suite.title] : ancestors;
    const specFindings = (suite.specs ?? []).flatMap((spec) => {
      const specTitle = [...suitePath, spec.title].join(" › ");
      const location = specLocation(spec, suite);
      return spec.tests.flatMap((testCase) =>
        playwrightTestFindings(testCase, specTitle, location),
      );
    });
    return [...specFindings, ...collectPlaywrightFindings(suite.suites ?? [], suitePath)];
  });

export const summarizePlaywrightReport = (raw: unknown, label = "Playwright"): SuiteSummary => {
  const report = playwrightReportSchema.parse(raw);
  const findings: SummaryFinding[] = [
    ...collectPlaywrightFindings(report.suites),
    ...report.errors.map((error) => ({
      kind: "failed" as const,
      title: "Runner setup failure",
      message: firstErrorLine([error.message]),
    })),
  ];
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

type VitestFile = z.infer<typeof vitestFileSchema>;

/** Reports each failed assertion, or the file itself when it failed without one (such as an import error). */
const vitestFileFindings = (file: VitestFile, workspaceRoot: string): SummaryFinding[] => {
  const relPath = relative(workspaceRoot, file.name) || file.name;
  const assertionFailures = file.assertionResults
    .filter((assertion) => assertion.status === "failed")
    .map((assertion): SummaryFinding => ({
      kind: "failed",
      title: assertion.fullName ?? assertion.title,
      location: relPath,
      message: firstErrorLine(assertion.failureMessages),
    }));
  if (file.status === "failed" && assertionFailures.length === 0) {
    return [
      {
        kind: "failed",
        title: `Suite failure: ${relPath}`,
        location: relPath,
        message: firstErrorLine([file.message]),
      },
    ];
  }
  return assertionFailures;
};

/** Measures from the run's start to the last file's end, or 0 when either is unknown. */
const vitestDurationMs = (report: z.infer<typeof vitestReportSchema>) => {
  const lastEnd = Math.max(0, ...report.testResults.map((file) => file.endTime ?? 0));
  return report.startTime && lastEnd > report.startTime ? lastEnd - report.startTime : 0;
};

export const summarizeVitestReport = (
  raw: unknown,
  label = "Vitest",
  workspaceRoot = process.cwd(),
): SuiteSummary => {
  const report = vitestReportSchema.parse(raw);
  return {
    label,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    flaky: 0,
    skipped: report.numPendingTests + report.numTodoTests,
    durationMs: vitestDurationMs(report),
    findings: report.testResults.flatMap((file) => vitestFileFindings(file, workspaceRoot)),
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

/** The step summary lists at most this many findings and counts the rest. */
const MAX_LISTED_FINDINGS = 25;

const formatFinding = (finding: SummaryFinding) => {
  const badge = finding.kind === "flaky" ? "FLAKY" : "FAILED";
  const loc = finding.location ? ` (\`${finding.location}\`)` : "";
  const detail = finding.message ? `: ${finding.message}` : "";
  return `- **${badge}** ${finding.title}${loc}${detail}`;
};

const formatFindingsSection = (findings: readonly SummaryFinding[]): string[] => {
  if (findings.length === 0) {
    return [];
  }
  const shown = findings.slice(0, MAX_LISTED_FINDINGS);
  const omitted = findings.length - shown.length;
  return [
    "",
    "#### Failed and flaky tests",
    "",
    ...shown.map(formatFinding),
    ...(omitted > 0 ? [`- _${omitted} additional findings omitted._`] : []),
  ];
};

const formatSuiteRow = (summary: SuiteSummary) =>
  `| ${escapeMarkdownCell(summary.label)} | ${summary.passed} | ${summary.failed} | ${summary.flaky} | ${summary.skipped} | ${formatDuration(summary.durationMs)} |`;

export const formatSummaryMarkdown = (title: string, summaries: SuiteSummary[]) => {
  if (summaries.length === 0) {
    return `### ${title}\n\nNo structured test reports were produced for this job.\n`;
  }
  const lines = [
    `### ${title}`,
    "",
    "| Suite | Passed | Failed | Flaky | Skipped | Duration |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...summaries.map(formatSuiteRow),
    ...formatFindingsSection(summaries.flatMap((summary) => summary.findings)),
  ];
  return `${lines.join("\n")}\n`;
};

const skippedScanDirs = new Set(["node_modules", ".git", "dist", ".output"]);

/** Lists a directory's entries, or none when it cannot be read. */
const readDirEntries = (dir: string): Dirent[] => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

const findFilesByName = (rootDir: string, targetName: string): string[] => {
  if (!existsSync(rootDir)) {
    return [];
  }
  const found: string[] = [];
  const stack = [rootDir];
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    for (const entry of readDirEntries(current)) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory() && !skippedScanDirs.has(entry.name)) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name === targetName) {
        found.push(entryPath);
      }
    }
  }
  return found.sort();
};

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** Summarizes each `playwright*.json` and `vitest*.json` report in `reportDir`, by file name. */
const summarizeReportDir = (reportDir: string, workspaceRoot: string): SuiteSummary[] =>
  readdirSync(reportDir)
    .sort()
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      const parsed = readJson(join(reportDir, file));
      const label = basename(file, ".json");
      if (file.startsWith("playwright")) {
        return [summarizePlaywrightReport(parsed, label)];
      }
      return file.startsWith("vitest") ? [summarizeVitestReport(parsed, label, workspaceRoot)] : [];
    });

/** Summarizes every Vitest report named `filename` under the workspace, labelled by its directory. */
const summarizeScannedVitestReports = (workspaceRoot: string, filename: string) =>
  findFilesByName(workspaceRoot, filename).map((reportPath) =>
    summarizeVitestReport(
      readJson(reportPath),
      relative(workspaceRoot, join(reportPath, "..")) || "workspace",
      workspaceRoot,
    ),
  );

export const collectCiSummaries = (options: {
  reportDir?: string;
  scanVitestFilename?: string;
  workspaceRoot?: string;
}): SuiteSummary[] => {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const { reportDir, scanVitestFilename } = options;
  return [
    ...(reportDir && existsSync(reportDir) ? summarizeReportDir(reportDir, workspaceRoot) : []),
    ...(scanVitestFilename ? summarizeScannedVitestReports(workspaceRoot, scanVitestFilename) : []),
  ];
};

export type CiSummaryOptions = { title: string; scanVitestFilename?: string };

/** Reads `[title] [--scan-vitest <report-file>]`, in either order. */
export const parseCiSummaryArgs = (args: readonly string[]): CiSummaryOptions => {
  const { values, positionals } = parseCliArgs(args, {
    options: { "scan-vitest": { type: "string" } },
    usage: "Usage: ci-summary.ts [title] [--scan-vitest <report-file>]",
    allowPositionals: true,
  });
  const [title = "Verification", extra] = positionals;
  if (extra !== undefined) {
    throw new Error(`Unexpected argument "${extra}"; quote a title that contains spaces.`);
  }
  const scanVitestFilename = values["scan-vitest"];
  return { title, ...(scanVitestFilename !== undefined ? { scanVitestFilename } : {}) };
};

const runCli = () => {
  const { title, scanVitestFilename } = parseCiSummaryArgs(process.argv.slice(2));
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

if (import.meta.main) {
  runCli();
}
