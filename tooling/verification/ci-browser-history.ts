import { execFileSync } from "node:child_process";
import { stripVTControlCharacters } from "node:util";

import { z } from "zod";

import { parseCliArgs, parseWholeNumber } from "../cli.ts";

const runsSchema = z.array(
  z.object({ databaseId: z.number(), attempt: z.number(), conclusion: z.string() }),
);
const jobSchema = z.object({
  id: z.number(),
  name: z.string(),
  run_attempt: z.number(),
  conclusion: z.string().nullable(),
});
const pagesSchema = z.array(z.object({ jobs: z.array(jobSchema) }));

type Job = z.infer<typeof jobSchema>;

// Playwright's list reporter prints one result line per attempt, including its project and
// file, and marks attempts after the first with their retry number.
const resultLine =
  /^\S+Z\s+([✘✓])\s+\d+ (\[[^\]]+\]) › (.+?):\d+:\d+ › (.+?)( \(retry #\d+\))? \([\d.]+(?:ms|s|m)\)$/gm;

const testResults = (job: Job, log: string, mark: string, attempts: "first" | "retries") => {
  const suite = job.name.replace(/ \(\d+\/\d+\)$/, "");
  return [...stripVTControlCharacters(log).matchAll(resultLine)]
    .filter(([, result, , , , retry]) => result === mark && (attempts === "retries") === !!retry)
    .map(([, , project, file, title]) => `${suite} ${project} ${file} › ${title}`);
};

const collectBrowserFailures = (jobs: Job[], readLog: (id: number) => string) => {
  const failures = new Map<string, boolean>();
  const failedJobs = jobs.filter(
    (job) =>
      job.name.startsWith("browser-") && job.run_attempt === 1 && job.conclusion === "failure",
  );
  for (const job of failedJobs) {
    const log = readLog(job.id);
    const tests = testResults(job, log, "✘", "first");
    if (tests.length === 0) {
      continue;
    }
    const retried = new Set(testResults(job, log, "✓", "retries"));
    for (const test of tests) {
      failures.set(test, retried.has(test));
    }
    const reruns = jobs.filter(
      (later) =>
        later.run_attempt > 1 &&
        later.name === job.name &&
        (later.conclusion === "success" || later.conclusion === "failure"),
    );
    for (const rerun of reruns) {
      const rerunLog = readLog(rerun.id);
      const passed = [
        ...testResults(rerun, rerunLog, "✓", "first"),
        ...testResults(rerun, rerunLog, "✓", "retries"),
      ];
      for (const test of passed) {
        if (failures.has(test)) {
          failures.set(test, true);
        }
      }
    }
  }
  return failures;
};

// gh api prints the HTTP status on stderr when downloading an expired or deleted log.
const unavailableLogError = z.object({ stderr: z.string().regex(/^gh: .*\(HTTP (?:404|410)\)$/m) });

export const browserFailures = (runId: number, jobs: Job[], readLog: (id: number) => string) => {
  try {
    return collectBrowserFailures(jobs, readLog);
  } catch (error) {
    if (!unavailableLogError.safeParse(error).success) {
      throw error;
    }
    console.warn(`Skipping Verify run ${runId} because a job log is unavailable.`);
    return new Map<string, boolean>();
  }
};

const gh = (...args: string[]) =>
  execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const HISTORY_USAGE = "Usage: ci-browser-history.ts [run-count]";

/** Reads the optional number of Verify runs to inspect (default 100). */
export const parseHistoryArgs = (args: readonly string[]): number => {
  const { positionals } = parseCliArgs(args, {
    options: {},
    usage: HISTORY_USAGE,
    allowPositionals: true,
  });
  const [raw, extra] = positionals;
  if (extra !== undefined) {
    throw new Error(`Unexpected argument "${extra}".\n${HISTORY_USAGE}`);
  }
  return raw === undefined ? 100 : parseWholeNumber(raw, "[run-count]");
};

const reportHistory = () => {
  const limit = parseHistoryArgs(process.argv.slice(2));
  const runs = runsSchema.parse(
    JSON.parse(
      gh(
        "run",
        "list",
        "--workflow",
        "verify.yml",
        "--limit",
        String(limit),
        "--json",
        "databaseId,attempt,conclusion",
      ),
    ),
  );
  const totals = new Map<string, { failures: number; recovered: number }>();
  for (const run of runs) {
    if (run.conclusion !== "failure" && !(run.conclusion === "success" && run.attempt > 1)) {
      continue;
    }
    const actions = "repos/{owner}/{repo}/actions";
    const raw = gh(
      "api",
      "--paginate",
      "--slurp",
      `${actions}/runs/${run.databaseId}/jobs?filter=all&per_page=100`,
    );
    const jobs = pagesSchema.parse(JSON.parse(raw)).flatMap((page) => page.jobs);
    for (const [test, recovered] of browserFailures(run.databaseId, jobs, (id) =>
      gh("api", `${actions}/jobs/${id}/logs`),
    )) {
      const count = totals.get(test) ?? { failures: 0, recovered: 0 };
      count.failures += 1;
      count.recovered += Number(recovered);
      totals.set(test, count);
    }
  }
  console.log(
    `Last ${runs.length} Verify runs\nFirst-attempt failures\tPassed on retry or rerun\tSuite, browser project and test`,
  );
  for (const [test, count] of [...totals].sort(
    ([a, x], [b, y]) => y.failures - x.failures || a.localeCompare(b),
  )) {
    console.log(`${count.failures}\t${count.recovered}\t${test}`);
  }
};

if (import.meta.main) {
  reportHistory();
}
