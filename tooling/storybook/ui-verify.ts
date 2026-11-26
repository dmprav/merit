import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { REPO_ROOT } from "../paths.ts";
import { parseUiVerifyArgs, USAGE, type UiVerifyCliOptions } from "./ui-verify/cli.ts";
import type { UiVerifyResults } from "./ui-verify/results.ts";
import { runUiVerify, type UiVerifyDependencies, type WatchInterrupts } from "./ui-verify/run.ts";

// A process ended by a signal reports 128 plus the signal's number, as shells do.
const INTERRUPT_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 } as const;

const INTERRUPT_SIGNALS = ["SIGINT", "SIGTERM"] as const;

/**
 * Tears the run down on Ctrl+C or SIGTERM, then exits with the first signal's conventional code.
 * Both listeners stay installed until then, so a repeated signal cannot end the process before
 * teardown finishes; it is ignored instead.
 */
export const watchProcessSignals: WatchInterrupts = (teardown) => {
  let shuttingDown = false;
  const listeners = INTERRUPT_SIGNALS.map((signal) => {
    const onSignal = () => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      void teardown(signal).finally(() => {
        process.exit(INTERRUPT_EXIT_CODES[signal]);
      });
    };

    process.on(signal, onSignal);
    return { signal, onSignal };
  });
  return () => {
    for (const { signal, onSignal } of listeners) {
      process.off(signal, onSignal);
    }
  };
};

/** Wires a run to this process: its output streams, the container runner, and its signals. */
export const cliDependencies = (options: UiVerifyCliOptions): UiVerifyDependencies => {
  // With --json, stdout carries only the results, so progress and container output go to stderr.
  const progress = options.json ? process.stderr : process.stdout;
  return {
    repoRoot: REPO_ROOT,
    log: (line) => {
      progress.write(`${line}\n`);
    },
    runContainer: (containerArgs) =>
      spawnSync(
        "vpx",
        [join(REPO_ROOT, "tooling/storybook/run-visual-container.ts"), ...containerArgs],
        {
          cwd: REPO_ROOT,
          stdio: options.json ? ["inherit", process.stderr, "inherit"] : "inherit",
        },
      ).status ?? 1,
    watchInterrupts: watchProcessSignals,
  };
};

const printOutcome = (options: UiVerifyCliOptions, results: UiVerifyResults): void => {
  const proof = `${results.outDir}/report.md and ${results.outDir}/results.json`;
  if (options.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else if (results.error) {
    process.stderr.write(
      `\nUI verification FAILED: ${results.error}\nProof written to ${proof}.\n`,
    );
  } else {
    process.stdout.write(
      `\nUI verification ${results.passed ? "PASSED" : "FAILED"} (${results.summary.passed}/${results.summary.total} targets passed). Proof written to ${proof}.\n`,
    );
  }
};

const main = async () => {
  const options = parseUiVerifyArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const results = await runUiVerify(options, cliDependencies(options));
  printOutcome(options, results);
  if (!results.passed) {
    process.exitCode = 1;
  }
};

if (import.meta.main) {
  await main();
}
