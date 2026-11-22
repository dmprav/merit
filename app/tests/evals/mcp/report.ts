import { readFileSync } from "node:fs";

import { z } from "zod";

import { invitationCalibration, resultStatus, trialResult, type TrialResult } from "./result.ts";

const reportSchema = z
  .object({
    version: z.union([z.literal(4), z.literal(5)]),
    startedAt: z.iso.datetime(),
    head: z.string().min(1),
    suite: z.string().min(1),
    complete: z.boolean(),
    selected: z.array(z.string()).nonempty(),
    results: z.array(trialResult),
    calibration: invitationCalibration.optional(),
  })
  .and(
    z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("scripted"), auth: z.null(), model: z.null() }),
      z.object({
        mode: z.enum(["codex", "claude"]),
        auth: z.enum(["subscription", "api-key"]),
        model: z.string().min(1),
      }),
    ]),
  );

const readRun = (file: string) => {
  const run = reportSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const ids = run.results.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Duplicate case IDs in ${file}`);
  }
  const selected = new Set(run.selected);
  if (
    selected.size !== run.selected.length ||
    ids.some((id) => !selected.has(id)) ||
    (run.complete && selected.size !== ids.length)
  ) {
    throw new Error(`Results do not match the report selection: ${file}`);
  }
  if (
    run.complete &&
    run.mode === "scripted" &&
    selected.has("compose-invite") &&
    !run.calibration
  ) {
    throw new Error(
      `Complete scripted report is missing a successful invitation calibration: ${file}`,
    );
  }
  return run;
};

const printRun = (label: string, run: z.infer<typeof reportSchema>) => {
  console.log(
    `${label}: ${run.mode} / ${run.model ?? "control"} / ${run.auth ?? "no credentials"} at ${run.startedAt} (HEAD ${run.head})`,
  );
  if (!run.complete) {
    console.log("Incomplete run. Showing completed trials only.");
  }
  const statuses = run.results.map(({ grade }) => resultStatus(grade));
  console.log(
    `${statuses.filter((s) => s === "passed").length} passed all automatic checks including the reply, ${statuses.filter((s) => s === "pending").length} await reply assessment, and ${statuses.filter((s) => s === "flagged").length} were flagged.`,
  );
  if (!run.complete) {
    const saved = new Set(run.results.map(({ id }) => id));
    const missing = run.selected.filter((id) => !saved.has(id));
    if (missing.length) {
      console.log(`Cases without a saved grade: ${missing.join(", ")}.`);
    }
  }
};

const printResult = (label: string, { observation, grade, replyCriterion }: TrialResult) => {
  const calls = observation.trace.map(({ name, outcome }) =>
    outcome.kind === "success" ? name : `${name} (${outcome.kind})`,
  );
  console.log(
    `  ${label} calls: ${calls.join(" → ") || "none"}. Mail to: ${observation.recipients.join(", ") || "nobody"}.`,
  );
  console.log(
    `    Tool calls: ${grade.selection.join(", ") || "pass"}. Persisted effects: ${grade.effects === null ? "no check" : grade.effects.join(", ") || "pass"}.`,
  );
  console.log(
    `    Reply assessment ${grade.reply.status}. ${grade.reply.status === "failed" ? grade.reply.issue : replyCriterion}`,
  );
  console.log(`    Reply: ${JSON.stringify(observation.reply)}`);
};

const [first, second] = process.argv.slice(2);
if (!first) {
  throw new Error("Supply a result file, or a base and candidate file to compare.");
}
const base = second ? readRun(first) : undefined;
const candidate = readRun(second ?? first);
if (base) {
  if (
    !base.complete ||
    !candidate.complete ||
    base.suite !== candidate.suite ||
    base.mode !== candidate.mode ||
    base.auth !== candidate.auth ||
    base.model !== candidate.model
  ) {
    throw new Error(
      "Compare complete, graded runs with the same case definitions, runner, auth mode and model. Inspect other files individually.",
    );
  }
  const baseIds = new Set(base.results.map(({ id }) => id));
  if (
    baseIds.size !== candidate.results.length ||
    candidate.results.some(({ id }) => !baseIds.has(id))
  ) {
    throw new Error("The runs contain different cases.");
  }
  printRun("Base", base);
}
printRun(second ? "Candidate" : "Run", candidate);
for (const result of candidate.results) {
  const previous = base?.results.find(({ id }) => id === result.id);
  console.log(`\n${result.id} — ${result.prompt}`);
  if (previous) {
    printResult("base", previous);
    const from = resultStatus(previous.grade);
    const to = resultStatus(result.grade);
    if (from !== to) {
      console.log(`  Automatic assessment changed from ${from} to ${to}.`);
    }
  }
  printResult(second ? "candidate" : "observed", result);
}
if (candidate.calibration) {
  console.log("\nCalibration — deliberately sending an invitation when asked for wording");
  printResult("scripted mistake", candidate.calibration);
}
