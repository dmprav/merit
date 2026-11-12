import { execFileSync } from "node:child_process";

const cwd = new URL("../../", import.meta.url);
const env = {
  ...process.env,
  DATABASE_URL: "postgres://merit:merit@127.0.0.1:55432/merit",
};

console.log("Deleting local Compose data and recreating the example workspaces...");

for (const [command, ...args] of [
  ["docker", "compose", "--file", "compose.yaml", "down", "--volumes"],
  ["docker", "compose", "--file", "compose.yaml", "up", "-d", "--wait"],
  ["vp", "run", "@merit/db#db:migrate"],
  ["vp", "run", "@merit/app#db:seed"],
] as const) {
  execFileSync(command, args, { cwd, env, stdio: "inherit" });
}

console.log("Local database reset and seeded.");
