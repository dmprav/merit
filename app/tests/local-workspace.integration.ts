import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createServer, preview, resolveConfig } from "vite-plus";
import { describe, expect, it, vi } from "vite-plus/test";

import { assertLocalWorkspaceDatabase, localWorkspace } from "../local-workspace.config";
import {
  allowsLocalWorkspaceRequest,
  localProvisioningIdentity,
} from "../src/development/local-workspace.server";

const database = "postgres://merit:merit@127.0.0.1:55432/merit";

describe("local workspace isolation", () => {
  it("selects the seeded reviewer independently of the invitation recipient", () => {
    const request = (person: string) =>
      new Request("http://127.0.0.1:3000/app", {
        headers: { cookie: `merit-local-person=${person}` },
      });

    expect(localProvisioningIdentity(request("reviewer"))).toEqual({
      actor: { clerkUserId: "local_reviewer" },
      operator: false,
      emails: ["reviewer@example.test"],
      displayName: "Robin Ellis",
    });
    expect(localProvisioningIdentity(request("recipient"))?.actor.clerkUserId).toBe(
      "local_recipient",
    );
    expect(localProvisioningIdentity(request("unknown"))).toBeUndefined();
  });

  it("only accepts loopback requests and same-origin browser calls", () => {
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
    }
  });

  it("only uses a loopback PostgreSQL database", () => {
    expect(() => assertLocalWorkspaceDatabase(database)).not.toThrow();
    expect(() => assertLocalWorkspaceDatabase(database + "?host=remote.example")).toThrow(
      "loopback PostgreSQL",
    );

    for (const host of ["example.com", "localhost.example.com", "192.168.1.1"]) {
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
    const output = new URL("../dist", import.meta.url);
    const files = await readdir(output, { recursive: true });
    const scripts = files.filter((file) => /\.(m?js)$/.test(file));

    expect(scripts).toContain("server/server.js");
    expect(scripts.length, "Build the host before running integration checks").toBeGreaterThan(0);

    for (const file of scripts) {
      const source = await readFile(join(output.pathname, file), "utf8");

      expect(source, file).not.toMatch(
        /seed_local_workspace|allowsLocalWorkspaceRequest|localWorkspaceIdentity|merit-local-person|local_operator|local_recipient|local_reviewer|TanStack Devtools|Merit development tooling/,
      );
    }
  });

  it("serves the built app and protects workspace access in local preview without credentials", async () => {
    for (const key of ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "RESEND_API_KEY"]) {
      vi.stubEnv(key, "");
    }
    vi.stubEnv("MERIT_LOCAL_PREVIEW", "1");
    vi.stubEnv("APP_ORIGIN", "http://127.0.0.1");
    try {
      const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
      try {
        const url = server.resolvedUrls?.local[0];
        if (!url) {
          throw new Error("Expected a local preview address.");
        }
        await promisify(execFile)(process.execPath, ["tests/smoke.ts"], {
          cwd: new URL("..", import.meta.url),
          env: { ...process.env, MERIT_BASE_URL: url },
        });
      } finally {
        await server.close();
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each(["process", "env-file"])(
    "rejects a non-loopback database from %s before starting a server",
    async (source) => {
      const envDir = await mkdtemp(join(tmpdir(), "merit-local-env-"));
      const name = "DATABASE_URL";
      const previous = process.env[name];

      try {
        vi.stubEnv(name, undefined);
        const override = "postgres://user:pass@remote.example/merit";
        if (source === "process") {
          vi.stubEnv(name, override);
        } else {
          await writeFile(join(envDir, ".env.local"), `${name}=${override}\n`);
        }

        await expect(
          createServer({
            configFile: false,
            mode: "local-workspace",
            root: envDir,
            plugins: [localWorkspace()],
          }),
        ).rejects.toThrow("loopback PostgreSQL");
      } finally {
        vi.stubEnv(name, previous);
        vi.unstubAllEnvs();
        await rm(envDir, { recursive: true, force: true });
      }
    },
  );
});
