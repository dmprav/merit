import { execFileSync } from "node:child_process";
import { stripVTControlCharacters } from "node:util";

import { z } from "zod";

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

// Playwright's list reporter prints one result line per test, including its project and file.
const resultLine =
  /^\S+Z\s+([✘✓])\s+\d+ (\[[^\]]+\]) › (.+?):\d+:\d+ › (.+) \([\d.]+(?:ms|s|m)\)$/gm;

const testResults = (job: Job, readLog: (id: number) => string, mark: string) => {
  const suite = job.name.replace(/ \(\d+\/\d+\)$/, "");
  return [...stripVTControlCharacters(readLog(job.id)).matchAll(resultLine)]
    .filter(([, result]) => result === mark)
    .map(([, , project, file, title]) => `${suite} ${project} ${file} › ${title}`);
};

export const browserFailures = (jobs: Job[], readLog: (id: number) => string) => {
  const failures = new Map<string, boolean>();
  const failedJobs = jobs.filter(
    (job) =>
      job.name.startsWith("browser-") && job.run_attempt === 1 && job.conclusion === "failure",
  );
  for (const job of failedJobs) {
    const tests = testResults(job, readLog, "✘");
    for (const test of tests) {
      failures.set(test, false);
    }
    if (tests.length === 0) {
      continue;
    }
    const reruns = jobs.filter(
      (later) =>
        later.run_attempt > 1 &&
        later.name === job.name &&
        (later.conclusion === "success" || later.conclusion === "failure"),
    );
    for (const rerun of reruns) {
      for (const passed of testResults(rerun, readLog, "✓")) {
        if (failures.has(passed)) {
          failures.set(passed, true);
        }
      }
    }
  }
  return failures;
};

const gh = (...args: string[]) =>
  execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const reportHistory = () => {
  const limit = z.coerce
    .number()
    .int()
    .positive()
    .parse(process.argv[2] ?? 100);
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
    for (const [test, recovered] of browserFailures(jobs, (id) =>
      gh("api", `${actions}/jobs/${id}/logs`),
    )) {
      const count = totals.get(test) ?? { failures: 0, recovered: 0 };
      count.failures += 1;
      count.recovered += Number(recovered);
      totals.set(test, count);
    }
  }
  console.log(
    `Last ${runs.length} Verify runs\nFirst-attempt failures\tPassed on rerun\tSuite, browser project and test`,
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
