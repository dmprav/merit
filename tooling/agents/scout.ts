import { parseCliArgs, parseWholeNumber, stripLeadingSeparator } from "../cli.ts";
import { REPO_ROOT } from "../paths.ts";
import {
  type AdvanceOptions,
  advanceRun,
  buildContext,
  buildDue,
  startRuns,
} from "./scout/commands.ts";
import { createScoutPorts } from "./scout/ports.ts";

const DUE_USAGE = "Usage: scout.ts due";
const CONTEXT_USAGE = "Usage: scout.ts context --run <run id>";
const ADVANCE_USAGE = "Usage: scout.ts advance --run <run id> --commit <scanTipSha> [--pr <n>]";

const START_USAGE = "Usage: scout.ts start --run <run id> [--run <run id> ...]";

const requireRun = (run: string | undefined, usage: string): string => {
  if (!run) {
    throw new Error(`Missing required --run flag.\n${usage}`);
  }
  return run;
};

/** Validates `advance` arguments before the state issue is read or rewritten. */
const parseAdvanceArgs = (args: readonly string[]): AdvanceOptions => {
  const { values } = parseCliArgs(args, {
    options: {
      run: { type: "string" },
      commit: { type: "string" },
      pr: { type: "string" },
    },
    usage: ADVANCE_USAGE,
  });
  const runId = requireRun(values.run, ADVANCE_USAGE);
  if (!values.commit) {
    throw new Error(
      'Missing required --commit <scanTipSha> flag. Pass the scanTipSha emitted by "scout.ts context".',
    );
  }
  return {
    runId,
    commitSha: values.commit,
    ...(values.pr !== undefined ? { prNumber: parseWholeNumber(values.pr, "--pr") } : {}),
  };
};

export type ScoutCommand =
  | { command: "due" }
  | { command: "context"; runId: string }
  | { command: "start"; runIds: string[] }
  | { command: "advance"; options: AdvanceOptions };

/** Validates a scout command line, including the `--` that `vp run` forwards, before any GitHub call. */
export const parseScoutArgs = (args: readonly string[]): ScoutCommand => {
  const [command, ...rest] = stripLeadingSeparator(args);
  if (command === "due") {
    parseCliArgs(rest, { options: {}, usage: DUE_USAGE });
    return { command };
  }
  if (command === "context") {
    const { values } = parseCliArgs(rest, {
      options: { run: { type: "string" } },
      usage: CONTEXT_USAGE,
    });
    return { command, runId: requireRun(values.run, CONTEXT_USAGE) };
  }
  if (command === "start") {
    const { values } = parseCliArgs(rest, {
      options: { run: { type: "string", multiple: true } },
      usage: START_USAGE,
    });
    if (!values.run?.length) {
      throw new Error(`Missing required --run flag.\n${START_USAGE}`);
    }
    return { command, runIds: values.run };
  }
  if (command === "advance") {
    return { command, options: parseAdvanceArgs(rest) };
  }
  throw new Error(
    `Unknown scout command "${command ?? ""}". Expected "due", "context", "start", or "advance".`,
  );
};

const runCli = () => {
  const command = parseScoutArgs(process.argv.slice(2));
  const ports = createScoutPorts(REPO_ROOT);

  if (command.command === "due") {
    console.log(JSON.stringify(buildDue(ports), null, 2));
    return;
  }
  if (command.command === "context") {
    console.log(JSON.stringify(buildContext(ports, command.runId), null, 2));
    return;
  }
  if (command.command === "start") {
    console.log(JSON.stringify(startRuns(ports, { runIds: command.runIds })));
    return;
  }
  console.log(JSON.stringify(advanceRun(ports, command.options)));
};

if (import.meta.main) {
  runCli();
}
