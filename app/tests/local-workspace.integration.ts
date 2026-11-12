import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";
import { resolveConfig } from "vite-plus";
import { describe, expect, it, vi } from "vite-plus/test";

import { assertLocalWorkspaceDatabase, localWorkspace } from "../local-workspace.config";
import { allowsLocalWorkspaceRequest } from "../src/development/local-workspace.server";

const database = "postgres://merit:merit@127.0.0.1:55432/merit";

describe("local workspace isolation", () => {
  it("only accepts loopback requests, same-origin browser calls and a local database", () => {
    expect(() => assertLocalWorkspaceDatabase(database)).not.toThrow();

    const url = "http://127.0.0.1:3000/app";

    expect(allowsLocalWorkspaceRequest(new Request(url))).toBe(true);
    expect(
      allowsLocalWorkspaceRequest(
        new Request(url, { headers: { Origin: "http://127.0.0.1:3000" } }),
      ),
    ).toBe(true);

    for (const origin of [
      "null",
      "",
      "https://evil.example",
      "http://127.0.0.1:4000",
      "https://127.0.0.1:3000",
    ]) {
      expect(allowsLocalWorkspaceRequest(new Request(url, { headers: { Origin: origin } }))).toBe(
        false,
      );
    }

    for (const host of ["example.com", "localhost.example.com", "192.168.1.1"]) {
      expect(allowsLocalWorkspaceRequest(new Request(`http://${host}/app`))).toBe(false);
      expect(() => assertLocalWorkspaceDatabase(`postgres://user:pass@${host}/merit`)).toThrow(
        "loopback PostgreSQL",
      );
    }
  });

  it("rejects local mode in builds, previews and externally bound servers", async () => {
    const config = {
      configFile: false as const,
      mode: "local-workspace",
      plugins: [localWorkspace()],
    };

    await expect(resolveConfig(config, "build")).rejects.toThrow(
      "only available in the development server",
    );
    await expect(resolveConfig(config, "serve", "production", "production", true)).rejects.toThrow(
      "only available in the development server",
    );
    await expect(
      resolveConfig({ ...config, server: { host: "0.0.0.0" } }, "serve"),
    ).rejects.toThrow("listen on 127.0.0.1");
  });

  it("excludes development tools, fixture identity and local adapter from the actual production output", async () => {
    const output = new URL("../.cloudflare/output/v0/workers/default", import.meta.url);
    const files = await readdir(output, { recursive: true });
    const scripts = files.filter((file) => /\.(m?js)$/.test(file));

    expect(scripts).toContain("bundle/index.js");
    expect(scripts.length, "Build the host before running integration checks").toBeGreaterThan(0);

    for (const file of scripts) {
      const source = await readFile(join(output.pathname, file), "utf8");

      expect(source, file).not.toMatch(
        /seed_local_workspace|allowsLocalWorkspaceRequest|localWorkspaceIdentity|merit-local-person|local_operator|local_recipient|TanStack Devtools|Merit development tooling/,
      );
    }
  });

  it("requires real secrets in the production Worker configuration", async () => {
    const config: unknown = JSON.parse(
      await readFile(
        new URL("../.cloudflare/output/v0/workers/default/worker.config.json", import.meta.url),
        "utf8",
      ),
    );

    expect(config).toMatchObject({
      env: { CLERK_SECRET_KEY: { type: "secret" }, RESEND_API_KEY: { type: "secret" } },
    });
  });

  it.each(["process", "env-file"])(
    "rejects a Hyperdrive override from %s before starting a server",
    async (source) => {
      const envDir = await mkdtemp(join(tmpdir(), "merit-local-env-"));
      const name = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";
      const previous = process.env[name];

      try {
        vi.stubEnv(name, undefined);
        const override = "postgres://user:pass@remote.example/merit";
        if (source === "process") {
          vi.stubEnv(name, override);
        } else {
          await writeFile(join(envDir, ".env.local-workspace"), `${name}=${override}\n`);
        }

        await expect(
          resolveConfig(
            {
              configFile: false,
              mode: "local-workspace",
              envDir,
              plugins: [
                localWorkspace(),
                cloudflare({ viteEnvironment: { name: "ssr" }, types: { generate: false } }),
              ],
            },
            "serve",
          ),
        ).rejects.toThrow("Use DATABASE_URL");
      } finally {
        vi.stubEnv(name, previous);
        vi.unstubAllEnvs();
        await rm(envDir, { recursive: true, force: true });
      }
    },
  );
});
