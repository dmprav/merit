import { runWorktreeCli } from "./worktree/cli.ts";

if (import.meta.main) {
  await runWorktreeCli(process.argv.slice(2), process.cwd());
}
