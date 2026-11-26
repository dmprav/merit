import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { REPO_ROOT } from "../paths.ts";

const cwd = REPO_ROOT;
const daemonConfig = "/etc/docker/daemon.json";
// Docker Hub rate-limits anonymous pulls from shared egress addresses. Compose
// pins every image by digest, so the mirror cannot change what runs.
const registryMirror = "https://mirror.gcr.io";
const daemonWaitSeconds = 30;

const succeeds = (command: string, args: string[]) => {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const daemonReachable = () => succeeds("docker", ["info"]);

const startDaemon = async () => {
  if (process.getuid?.() !== 0 || !succeeds("dockerd", ["--version"])) {
    throw new Error(
      "The Docker daemon is not reachable. Start Docker, then run `vp run services:start`.",
    );
  }
  if (!existsSync(daemonConfig)) {
    mkdirSync("/etc/docker", { recursive: true });
    writeFileSync(daemonConfig, `${JSON.stringify({ "registry-mirrors": [registryMirror] })}\n`);
  }
  const log = join(tmpdir(), "merit-dockerd.log");
  console.log(`Starting the Docker daemon (log: ${log})...`);
  const output = openSync(log, "a");
  spawn("dockerd", [], { detached: true, stdio: ["ignore", output, output] }).unref();
  for (let second = 0; second < daemonWaitSeconds; second += 1) {
    if (daemonReachable()) {
      return;
    }
    await setTimeout(1000);
  }
  throw new Error(`The Docker daemon did not start within ${daemonWaitSeconds}s; see ${log}.`);
};

if (!daemonReachable()) {
  await startDaemon();
}
execFileSync("docker", ["compose", "--file", "compose.yaml", "up", "-d", "--wait"], {
  cwd,
  stdio: "inherit",
});
console.log("PostgreSQL, Mailpit, file storage, and Temporal are running.");
