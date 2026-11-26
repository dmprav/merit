// Runs a web server command beside the application worker, for `dev` and `preview`.
// Usage: vpx scripts/with-worker.ts [--watch] <command> [args...]
//
// The worker is a separate process. If it stops, for example because Temporal is not
// running, the web server keeps going; when the web server stops, the worker stops too.
import { spawn, type ChildProcess } from "node:child_process";

const args = process.argv.slice(2);
const watch = args[0] === "--watch";
const [command, ...commandArgs] = watch ? args.slice(1) : args;
if (!command) {
  throw new Error("Usage: with-worker.ts [--watch] <command> [args...]");
}

// The watcher also reruns when a workflow module changes (the SDK's bundler reads those, so
// the import graph misses them) or when `.env.local` does (read at startup, not imported).
// The worker never reads the terminal, so Vite's keyboard shortcuts reach Vite alone.
const watcher = [
  "--watch",
  "--no-rerun-on-enter",
  "--include",
  "src/**/*.workflow.ts",
  "--include",
  ".env.local",
];
const worker = spawn("vpx", [...(watch ? watcher : []), "src/worker/main.ts"], {
  stdio: ["ignore", "inherit", "inherit"],
  env: {
    ...process.env,
    MERIT_LOCAL_WORKER: "1",
    // The origin of the links the worker puts in emails, set for the worker only. A run that
    // serves the web on another port than APP_ORIGIN, such as the browser tests, names it here
    // without changing the origin the web server itself reports.
    ...(process.env.MERIT_WORKER_APP_ORIGIN
      ? { APP_ORIGIN: process.env.MERIT_WORKER_APP_ORIGIN }
      : {}),
  },
});
worker.on("error", (error) => console.error(`[worker] Could not start: ${error.message}`));
worker.on("exit", (code, signal) => {
  if (!stopping) {
    console.warn(
      `[worker] Stopped (${signal ?? `exit ${code}`}). The web server keeps running; restart the command to run the worker again.`,
    );
  }
});

const web = spawn(command, commandArgs, { stdio: "inherit" });
let stopping = false;

const stop = (child: ChildProcess) => {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
  }
};

// A terminal sends Ctrl+C to the whole foreground group, so both children already have it;
// this listener only keeps the runner alive until they finish.
process.on("SIGINT", () => {});
process.on("SIGTERM", () => {
  stopping = true;
  stop(web);
});
web.on("error", (error) => {
  console.error(`Could not start ${command}: ${error.message}`);
  process.exitCode = 1;
  stopping = true;
  stop(worker);
});
web.on("exit", (code, signal) => {
  stopping = true;
  stop(worker);
  process.exitCode = code ?? (signal ? 1 : 0);
});
