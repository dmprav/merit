import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, it } from "vite-plus/test";

const script = fileURLToPath(new URL("./secrets.ts", import.meta.url));
const directories: string[] = [];

// Never issued by a provider; scans must detect its shape without contacting GitHub.
const token = () => `ghp_${randomBytes(18).toString("hex")}`;

const alphanumeric = (length: number) =>
  Array.from(
    randomBytes(length),
    (byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[byte % 62],
  ).join("");

// Assembled at runtime so this file never contains a provider-shaped literal.
const resendKey = () => ["re", alphanumeric(8), alphanumeric(24)].join("_");

const clerkKey = (mode: "live" | "test") => ["sk", mode, alphanumeric(40)].join("_");

const repository = () => {
  const cwd = mkdtempSync(join(tmpdir(), "merit-secrets-"));
  directories.push(cwd);

  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Security fixture",
        GIT_AUTHOR_EMAIL: "security@example.test",
        GIT_COMMITTER_NAME: "Security fixture",
        GIT_COMMITTER_EMAIL: "security@example.test",
      },
    });

  git("init", "--quiet");

  return {
    cwd,
    git,
    write: (name: string, content: string) => {
      const path = join(cwd, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    },
    scan: (mode = "files", env = process.env) => {
      const result = spawnSync(process.execPath, [script, mode], {
        cwd,
        env,
        encoding: "utf8",
        timeout: 30_000,
      });

      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();

      return { status: result.status, output: result.stdout + result.stderr };
    },
  };
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("scans new files, respects Git ignores, and redacts detected secrets", () => {
  const repo = repository();
  const secret = token();
  repo.write(".gitignore", ".env.local\nnode_modules/\n");
  repo.write(".env.local", `GITHUB_TOKEN=${secret}\n`);
  repo.write("node_modules/example/key.txt", secret);
  repo.write("source.ts", 'export const name = "Merit";\n');

  expect(repo.scan().status).toBe(0);

  repo.write("new file.txt", `GITHUB_TOKEN=${secret}\n`);
  const leaked = repo.scan();

  expect(leaked.status, leaked.output).toBe(1);
  expect(leaked.output).toContain("new file.txt");
  expect(leaked.output).not.toContain(secret);
});

it("scans force-added ignored files and tolerates tracked files deleted from disk", () => {
  const repo = repository();
  repo.write(".gitignore", ".env.local\n");
  repo.write(".env.local", token());
  repo.git("add", "--force", ".env.local");

  const leaked = repo.scan();
  expect(leaked.status, leaked.output).toBe(1);
  expect(leaked.output).toContain(".env.local");

  rmSync(join(repo.cwd, ".env.local"));
  expect(repo.scan().status).toBe(0);
});

it("checks the staged snapshot even when the working copy differs, before the first commit", () => {
  const repo = repository();
  const secret = token();
  repo.write("key.txt", "No credentials here.\n");
  repo.git("add", "key.txt");
  repo.write("key.txt", secret);

  const clean = repo.scan("staged");
  expect(clean.status, clean.output).toBe(0);

  repo.git("add", "key.txt");
  repo.write("key.txt", "No credentials here.\n");
  const leaked = repo.scan("staged");

  expect(leaked.status, leaked.output).toBe(1);
  expect(leaked.output).toContain("key.txt");
  expect(leaked.output).not.toContain(secret);
});

it("detects secrets removed from the current files but retained in Git history", () => {
  const repo = repository();
  const secret = token();
  repo.write("key.txt", secret);
  repo.git("add", "key.txt");
  repo.git("commit", "--quiet", "-m", "Add synthetic credential");
  repo.write("key.txt", "No credentials here.\n");
  repo.git("commit", "--quiet", "-am", "Remove synthetic credential");

  expect(repo.scan().status).toBe(0);
  const leaked = repo.scan("history");

  expect(leaked.status, leaked.output).toBe(1);
  expect(leaked.output).toContain("key.txt");
  expect(leaked.output).not.toContain(secret);
});

it("fails when Git cannot list files instead of treating the check as clean", () => {
  const repo = repository();
  rmSync(join(repo.cwd, ".git"), { recursive: true, force: true });
  const result = repo.scan("files", { ...process.env, GIT_CEILING_DIRECTORIES: dirname(repo.cwd) });

  expect(result.status).not.toBe(0);
  expect(result.output).toContain("not a git repository");
});

it("allows exact local fixtures while detecting other credentials in the same files", () => {
  const repo = repository();
  const fixtures = {
    "compose.yaml": "POSTGRES_USER: merit\nPOSTGRES_PASSWORD: merit\n",
    "foundation/db/drizzle.config.ts":
      'const url = "postgres://merit:merit@127.0.0.1:55432/merit";\n',
    "tooling/scripts/reset-db.test.ts":
      'const url = "postgres://example:example@remote.invalid/production";\n',
    "app/tests/browser/workspace.playwright.config.ts":
      'const VITE_CLERK_PUBLISHABLE_KEY = "pk_test_Y2xlcmsuZXhhbXBsZSQ=";\n',
  };

  for (const [path, content] of Object.entries(fixtures)) {
    repo.write(path, content);
  }
  const clean = repo.scan();
  expect(clean.status, clean.output).toBe(0);

  const secret = token();
  for (const [path, content] of Object.entries(fixtures)) {
    repo.write(path, `${content}\nGITHUB_TOKEN=${secret}\n`);
  }
  const leaked = repo.scan();
  expect(leaked.status, leaked.output).toBe(1);
  for (const path of Object.keys(fixtures)) {
    expect(leaked.output).toContain(path);
  }
  expect(leaked.output).not.toContain(secret);
});

it("rejects a different database password even at the allowed loopback address", () => {
  const repo = repository();
  const secret = randomBytes(18).toString("hex");
  repo.write("database.ts", `const url = "postgres://merit:${secret}@127.0.0.1:55432/merit";\n`);

  const result = repo.scan();
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain("database.ts");
  expect(result.output).not.toContain(secret);
});

it.each([
  { rule: "merit/resend-api-key", secret: resendKey },
  { rule: "merit/clerk-secret-key", secret: () => clerkKey("live") },
  { rule: "merit/clerk-secret-key", secret: () => clerkKey("test") },
])("detects a key with $rule", ({ rule, secret }) => {
  const repo = repository();
  const value = secret();
  repo.write(".dev.vars.example", `KEY=${value}\n`);

  const result = repo.scan();
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain(rule);
  expect(result.output).not.toContain(value);
});

it("ignores provider prefixes inside identifiers and short placeholders", () => {
  const repo = repository();
  repo.write(
    "near-miss.ts",
    [
      // Prefixes preceded by identifier characters are part of a longer name.
      `const value = "pre${resendKey()}";`,
      `const value = "task${clerkKey("live").slice(2)}";`,
      // Documentation placeholders do not have the issued key shape.
      `const value = "${["re", "123456789"].join("_")}";`,
      `const value = "${["re", alphanumeric(8), alphanumeric(12)].join("_")}";`,
      `const value = "${["sk", "test", "x".repeat(8)].join("_")}";`,
      "",
    ].join("\n"),
  );

  const result = repo.scan();
  expect(result.status, result.output).toBe(0);
});
