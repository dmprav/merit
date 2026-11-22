import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, rename, rm, writeFile } from "node:fs/promises";

import { afterAll, assert, beforeAll, expect } from "vite-plus/test";
import { z } from "zod";

import { readOnlyToolNames } from "@merit/mcp";

import { catalogTest } from "./catalog-trial";
import { gradeTrial } from "./grade";
import { evalCases } from "./registry";
import { invitationCalibration, resultStatus, type TrialResult } from "./result";
import { runClaude } from "./runners/claude";
import { runCodex } from "./runners/codex";
import { selectCases } from "./select";
import { fingerprintSuite } from "./suite-fingerprint";

const selected = process.env.MERIT_EVAL_CASES
  ? selectCases({
      case: z.array(z.string()).nonempty().parse(JSON.parse(process.env.MERIT_EVAL_CASES)),
    })
  : evalCases;
const suite = fingerprintSuite(selected, readOnlyToolNames);

const mode = z
  .enum(["scripted", "codex", "claude"])
  .parse(process.env.MERIT_EVAL_MODE ?? "scripted");
const output = process.env.MERIT_EVAL_OUTPUT;
const live =
  mode === "scripted"
    ? null
    : {
        model: z.string().trim().min(1).parse(process.env.MERIT_EVAL_MODEL),
        auth: z
          .enum(["subscription", "api-key"])
          .parse(process.env.MERIT_EVAL_AUTH ?? "subscription"),
        run: mode === "claude" ? runClaude : runCodex,
      };
const startedAt = new Date().toISOString();
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (live && !output) {
  throw new Error("Set MERIT_EVAL_OUTPUT to a new file before running live evals.");
}

const results: TrialResult[] = [];
let ownsReport = false;
let calibration: TrialResult | undefined;

const checkpoint = async (complete = false) => {
  if (!ownsReport || !output) {
    return;
  }
  const snapshot = {
    version: 5,
    selected: selected.map((item) => item.id),
    mode,
    model: live?.model ?? null,
    auth: live?.auth ?? null,
    startedAt,
    head: revision,
    suite,
    complete,
    results,
    calibration,
  };
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
};

beforeAll(async () => {
  if (output) {
    const reservation = await open(output, "wx", 0o600);
    await reservation.close();
    ownsReport = true;
    await checkpoint();
  }
});

catalogTest.for(selected)("$id", async (item, { catalog }) => {
  const trial = await catalog(item.id);
  const { server } = trial;
  const reply = live
    ? await live.run({
        model: live.model,
        meritUserId: trial.meritUserId,
        auth: live.auth,
        url: server.url,
        token: server.token,
        mailUrl: server.mailUrl,
        prompt: item.prompt,
      })
    : await trial.scripted();
  results.push(await gradeTrial(item, trial, reply));
  await checkpoint();
});

const compose = selected.find((item) => item.id === "compose-invite");
const calibrate = mode === "scripted" && compose !== undefined;
catalogTest.skipIf(!calibrate)(
  "detects an invitation sent for a drafting request",
  async ({ catalog }) => {
    assert(compose);
    const trial = await catalog(compose.id);
    assert(trial.scenario.calibrationControl);
    const reply = await trial.scripted(trial.scenario.calibrationControl);
    calibration = invitationCalibration.parse(await gradeTrial(compose, trial, reply));
  },
);

afterAll(async () => {
  await checkpoint(results.length === selected.length && (!calibrate || calibration !== undefined));
  expect(
    results
      .filter(({ grade }) => resultStatus(grade) === "flagged")
      .map(({ id, grade }) => ({ id, grade })),
  ).toEqual([]);
});
