import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { bindings } from "cf/config";
import { defineConfig, lazyPlugins } from "vite-plus";

import { reactCompilerOptions } from "../tooling/react-compiler";
import { localWorkspace } from "./local-workspace.config";
import { routes } from "./routes";

const run = {
  tasks: {
    dev: { command: "cf dev", cache: false },
    "dev:workspace": { command: "vp dev --mode local-workspace", cache: false },
    build: ["cf build", "tsc --noEmit"],
    preview: { command: "vp preview", cache: false },
    "cf-types": "cf workers types",
    test: "vp test --config vitest.config.ts",
    deploy: {
      command: "cf deploy --prebuilt --mode production",
      dependsOn: ["build"],
      cache: false,
    },
    "demo:cleanup": { command: "vpx scripts/clean-demos.ts", cache: false },
    "db:seed": { command: "vpx scripts/seed.ts", cache: false },
    smoke: { command: "vpx tests/smoke.ts", cache: false },
    "test:integration": {
      command: "vp test --config vitest.integration.config.ts",
      cache: false,
    },
    "test:demo-browser": {
      command: "vpx tests/demo-browser.ts --project desktop",
      cache: false,
    },
    "test:demo-browser:all": { command: "vpx tests/demo-browser.ts", cache: false },
    "test:workspace": {
      command: "vpx tests/workspace-browser.ts --project desktop",
      cache: false,
    },
    "test:workspace:all": { command: "vpx tests/workspace-browser.ts", cache: false },
  },
};

export default defineConfig(({ command }) => ({
  publicDir: "./public",
  // Task discovery must not run plugin hooks that clear the production output.
  plugins: lazyPlugins(() => [
    localWorkspace(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // Empty defaults are local only; builds retain the required secret declarations.
      config:
        command === "serve"
          ? (config) => ({
              ...config,
              worker: {
                ...config.worker,
                env: {
                  ...config.worker.env,
                  CLERK_SECRET_KEY: bindings.text(""),
                  RESEND_API_KEY: bindings.text(""),
                },
              },
            })
          : undefined,
    }),
    tanstackStart({
      srcDirectory: "./src",
      server: { entry: "./server.ts" },
      router: {
        // The virtual tree scans only the explicitly mounted app route directories.
        routesDirectory: "../..",
        virtualRouteConfig: routes,
        // Loading and recovery must remain available when the next request cannot reach the server.
        codeSplittingOptions: { defaultBehavior: [["component"]] },
      },
      importProtection: {
        behavior: "error",
        client: {
          specifiers: [
            /^@tanstack\/(react|solid|vue)-start\/server$/,
            /^@merit\/(db|mcp|test-support)(\/|$)/,
            /^@merit\/auth\/(mcp|schema|session|users)(\/|$)/,
            /^@merit\/[^/]+\/(server|example-server|testing|schema|scope|locks)(\/|$)/,
          ],
          files: [
            "**/*.server.*",
            /\/capabilities\/[^/]+\/(?:business\/)?src\/(server|operations|persistence)\//,
            /\/interfaces\/mcp\/src\//,
          ],
        },
      },
    }),
    react({ compiler: reactCompilerOptions }),
  ]),
  server: { port: 3000, strictPort: true },
  environments: {
    ssr: {
      build: {
        rolldownOptions: {
          // pg uses CommonJS Node built-ins inside the Worker's ESM bundle.
          output: {
            banner:
              "import { createRequire } from 'node:module'; const require = createRequire('file:///worker.js');",
          },
        },
      },
    },
  },
  run,
}));
