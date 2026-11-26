import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const snapshotsDir = join(root, "tooling/storybook/snapshots");
const playwrightImage =
  "mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f";
const volumeName = "merit-playwright-linux-work";
const storeVolumeName = "merit-playwright-linux-pnpm-store";

const ensureDockerReady = () => {
  const check = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (check.status !== 0) {
    throw new Error(
      "Docker daemon is required for test:browser:stories:container. Start Docker and rerun.",
    );
  }
};

const readExpectedPnpm = (): string => {
  const pkgPath = join(root, "package.json");
  const version = execFileSync(
    process.execPath,
    [
      "-e",
      "const pkg = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')); console.log(pkg.devEngines?.packageManager?.version ?? '');",
      pkgPath,
    ],
    { encoding: "utf8" },
  ).trim();
  if (!version) {
    throw new Error("Could not read devEngines.packageManager.version from package.json.");
  }
  return version;
};

const valueFlags = new Set([
  "-c",
  "--config",
  "-g",
  "--grep",
  "--grep-invert",
  "-j",
  "--workers",
  "--max-failures",
  "--output",
  "--project",
  "--repeat-each",
  "--reporter",
  "--retries",
  "--shard",
  "--timeout",
]);

const hasSpecArg = (args: string[]) => {
  let expectValue = false;
  for (const arg of args) {
    if (expectValue) {
      expectValue = false;
      continue;
    }
    if (valueFlags.has(arg)) {
      expectValue = true;
      continue;
    }
    if (!arg.startsWith("-")) {
      return true;
    }
  }
  return false;
};

const buildPlaywrightArgs = (rawArgs: string[]) => {
  const args = rawArgs.filter((arg) => arg !== "--");
  const hasSpec = hasSpecArg(args);
  const hasProject = args.some((arg) => arg === "--project" || arg.startsWith("--project="));
  const hasWorkers = args.some(
    (arg) => arg === "--workers" || arg.startsWith("--workers=") || arg === "-j",
  );
  const updating = args.includes("--update-snapshots") || args.includes("-u");
  return {
    updating,
    playwrightArgs: [
      ...(hasSpec ? [] : ["tests/browser/visual.spec.ts"]),
      ...(hasProject ? [] : ["--project", "desktop", "--project", "mobile"]),
      ...(hasWorkers ? [] : ["--workers", "2"]),
      ...args,
    ],
  };
};

const buildContainerCommand = (
  expectedPnpm: string,
  updating: boolean,
  playwrightArgs: string[],
) => {
  const quotedArgs = playwrightArgs.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" ");
  return [
    "set -euo pipefail",
    "exec 9>/work/.run.lock",
    "flock 9",
    "mkdir -p /work/.tools /work/tooling/storybook/snapshots",
    'if [ ! -x /work/.tools/node_modules/.bin/pnpm ] || [ "$(cat /work/.tools/pnpm-version 2>/dev/null || true)" != \'' +
      expectedPnpm +
      "' ]; then",
    `  npm install --prefix /work/.tools --no-save pnpm@${expectedPnpm}`,
    `  printf '%s' '${expectedPnpm}' > /work/.tools/pnpm-version`,
    "fi",
    'export PATH="/work/.tools/node_modules/.bin:$PATH"',
    "find /work -mindepth 1 -depth ! -path '/work/.run.lock' ! -path '/work/.tools' ! -path '/work/.tools/*' ! -path '/work/.deps-hash' ! -path '*/node_modules' ! -path '*/node_modules/*' -delete 2>/dev/null || true",
    "tar -C /src --exclude='./.git' --exclude='./.tmp' --exclude='./.claude/worktrees' --exclude='./node_modules' --exclude='*/node_modules' --exclude='./tooling/storybook/dist' --exclude='./tooling/storybook/node_modules/.cache' -cf - . | tar -C /work -xf -",
    "cd /work",
    "lock_hash=\"$( { sha256sum pnpm-lock.yaml pnpm-workspace.yaml; find . -maxdepth 4 -name package.json -not -path '*/node_modules/*' | sort | xargs sha256sum; } | sha256sum | awk '{print $1}' )\"",
    'if [ ! -d /work/node_modules ] || [ "$(cat /work/.deps-hash 2>/dev/null || true)" != "$lock_hash" ]; then',
    "  pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm-store",
    "  printf '%s' \"$lock_hash\" > /work/.deps-hash",
    "fi",
    "cd /work/tooling/storybook",
    "export MERIT_TASK_CACHE=off",
    "export CI=1",
    'export PATH="/work/tooling/storybook/node_modules/.bin:/work/node_modules/.bin:$PATH"',
    `./node_modules/.bin/playwright test --config playwright.config.ts ${quotedArgs}`,
    ...(updating
      ? [
          "mkdir -p /out",
          "rm -rf /out/*",
          "cp -f /work/tooling/storybook/snapshots/*-linux.png /out/ 2>/dev/null || true",
        ]
      : []),
  ].join("\n");
};

const syncSnapshotsOut = (outDir: string) => {
  for (const file of readdirSync(outDir)) {
    if (file.endsWith("-linux.png")) {
      cpSync(join(outDir, file), join(snapshotsDir, file));
    }
  }
};

const main = () => {
  ensureDockerReady();
  const expectedPnpm = readExpectedPnpm();
  const { updating, playwrightArgs } = buildPlaywrightArgs(process.argv.slice(2));
  const outDir = updating ? mkdtempSync(join(tmpdir(), "merit-visual-out-")) : undefined;

  try {
    const dockerArgs = [
      "run",
      "--rm",
      "--ipc=host",
      "-v",
      `${root}:/src:ro`,
      "-v",
      `${volumeName}:/work`,
      "-v",
      `${storeVolumeName}:/pnpm-store`,
      ...(outDir ? ["-v", `${outDir}:/out`] : []),
      playwrightImage,
      "bash",
      "-lc",
      buildContainerCommand(expectedPnpm, updating, playwrightArgs),
    ];

    const result = spawnSync("docker", dockerArgs, { stdio: "inherit" });
    if (outDir && existsSync(outDir)) {
      syncSnapshotsOut(outDir);
    }
    process.exitCode = result.status ?? 1;
  } finally {
    if (outDir) {
      rmSync(outDir, { recursive: true, force: true });
    }
  }
};

main();
