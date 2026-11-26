import { parseCliArgs, parseWholeNumber, stripLeadingSeparator } from "../cli.ts";
import { REPO_ROOT } from "../paths.ts";
import { SCOUT_LENSES, type ScoutLens } from "./proposal.ts";
import { type AdvanceOptions, advanceLens, buildContext } from "./scout/commands.ts";
import { createScoutPorts } from "./scout/ports.ts";
import { lensNameSchema } from "./scout/state.ts";

const CONTEXT_USAGE = `Usage: scout.ts context --lens <auto|${SCOUT_LENSES.join("|")}>`;
const ADVANCE_USAGE = `Usage: scout.ts advance --lens <${SCOUT_LENSES.join("|")}> --commit <scanTipSha> [--target <rotationTarget>] [--pr <n>]`;

const requireLens = (lens: string | undefined, usage: string): string => {
  if (lens === undefined) {
    throw new Error(`Missing required --lens flag.\n${usage}`);
  }
  return lens;
};

/** Reads `context` arguments; `--lens auto` lets the command pick the next lens. */
const parseContextArgs = (args: readonly string[]): ScoutLens | "auto" => {
  const { values } = parseCliArgs(args, {
    options: { lens: { type: "string" } },
    usage: CONTEXT_USAGE,
  });
  const lens = requireLens(values.lens, CONTEXT_USAGE);
  return lens === "auto" ? "auto" : lensNameSchema.parse(lens);
};

/** Validates `advance` arguments before the state issue is read or rewritten. */
const parseAdvanceArgs = (args: readonly string[]): AdvanceOptions => {
  const { values } = parseCliArgs(args, {
    options: {
      lens: { type: "string" },
      commit: { type: "string" },
      target: { type: "string" },
      pr: { type: "string" },
    },
    usage: ADVANCE_USAGE,
  });
  const lens = requireLens(values.lens, ADVANCE_USAGE);
  if (lens === "auto") {
    throw new Error(
      'Cannot pass "--lens auto" to advance. Pass the explicit lens emitted by "scout.ts context".',
    );
  }
  if (!values.commit) {
    throw new Error(
      'Missing required --commit <scanTipSha> flag. Pass the scanTipSha emitted by "scout.ts context".',
    );
  }
  const target = values.target?.trim();
  return {
    lens: lensNameSchema.parse(lens),
    commitSha: values.commit,
    ...(target ? { target } : {}),
    ...(values.pr !== undefined ? { prNumber: parseWholeNumber(values.pr, "--pr") } : {}),
  };
};

export type ScoutCommand =
  | { command: "context"; lens: ScoutLens | "auto" }
  | { command: "advance"; options: AdvanceOptions };

/** Validates a scout command line, including the `--` that `vp run` forwards, before any GitHub call. */
export const parseScoutArgs = (args: readonly string[]): ScoutCommand => {
  const [command, ...rest] = stripLeadingSeparator(args);
  if (command === "context") {
    return { command, lens: parseContextArgs(rest) };
  }
  if (command === "advance") {
    return { command, options: parseAdvanceArgs(rest) };
  }
  throw new Error(`Unknown scout command "${command ?? ""}". Expected "context" or "advance".`);
};

const runCli = () => {
  const command = parseScoutArgs(process.argv.slice(2));
  const ports = createScoutPorts(REPO_ROOT);

  if (command.command === "context") {
    console.log(JSON.stringify(buildContext(ports, command.lens), null, 2));
    return;
  }
  console.log(JSON.stringify(advanceLens(ports, command.options)));
};

if (import.meta.main) {
  runCli();
}
