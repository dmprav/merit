import { resolve } from "node:path";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins, type ViteDevServer } from "vite-plus";

import { loadEnvLocalFiles, readPort } from "@merit/test-support/env";

import { reactCompilerOptions } from "../tooling/react-compiler";
import { localWorkspace } from "./local-workspace.config";
import { routes } from "./routes";

loadEnvLocalFiles([
  resolve(import.meta.dirname, ".env.local"),
  resolve(import.meta.dirname, "../.env.local"),
]);

const devPort = readPort(process.env.MERIT_DEV_PORT, 3000);

// Vite handles SIGTERM and the quit shortcut. Route Ctrl+C through the same close hooks.
const closeOnInterrupt = (server: Pick<ViteDevServer, "httpServer" | "close" | "config">) => {
  if (!server.httpServer) {
    return;
  }

  const interrupt = () => {
    process.exitCode = 130;
    void server.close().catch((error: unknown) => server.config.logger.error(String(error)));
  };

  process.once("SIGINT", interrupt);
  server.httpServer.once("close", () => process.off("SIGINT", interrupt));
};

const shutdownTelemetry = async () =>
  (await import("@merit/telemetry/server")).shutdownServerTelemetry();

const run = {
  tasks: {
    dev: { command: "vp dev", cache: false },
    "dev:workspace": { command: "vp dev --mode local-workspace", cache: false },
    build: ["vp build", "tsc --noEmit"],
    test: "vp test --config vitest.config.ts",
    preview: {
      command: `env MERIT_LOCAL_PREVIEW=1 vp preview --host localhost --port ${devPort} --strictPort`,
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

// Pre-bundle lazily reached client libraries on dev startup so browser journeys never
// trigger mid-test reloads or stale module imports.
const clientDependencies = [
  "@merit/ui > @merit/dates > @internationalized/date",
  "@tanstack/react-devtools",
  "@merit/forms > @tanstack/react-form",
  "@tanstack/react-query",
  "@tanstack/react-query-devtools",
  "@tanstack/react-router",
  "@tanstack/react-router-devtools",
  "@tanstack/react-router-ssr-query",
  "@merit/product > @merit/tables > @tanstack/react-table",
  "@merit/drafts > dexie",
  "i18next",
  "react-i18next",
  "@merit/ui > react-aria-components/Button",
  "@merit/ui > react-aria-components/Calendar",
  "@merit/ui > react-aria-components/Dialog",
  "@merit/ui > react-aria-components/Heading",
  "@merit/ui > react-aria-components/I18nProvider",
  "@merit/ui > react-aria-components/ListBox",
  "@merit/ui > react-aria-components/Menu",
  "@merit/ui > react-aria-components/Modal",
  "@merit/ui > react-aria-components/Popover",
  "@merit/ui > react-aria-components/Select",
  "@merit/ui > react-aria-components/Tabs",
  "@merit/ui > react-aria-components/TextField",
  "@merit/ui > react-aria-components/Tooltip",
  "@merit/ui > react-aria-components/composeRenderProps",
  "zod",
];

export default defineConfig({
  publicDir: "./public",
  // Task discovery must not run plugin hooks that clear the production output.
  plugins: lazyPlugins(() => [
    localWorkspace(),
    {
      name: "merit-telemetry-shutdown",
      configureServer: closeOnInterrupt,
      configurePreviewServer: closeOnInterrupt,
      closeServer: shutdownTelemetry,
      closePreviewServer: shutdownTelemetry,
    },
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
            /^@merit\/telemetry($|\/(?!errors$))/,
            /^@opentelemetry\//,
            /^@merit\/auth\/(clerk-oauth|clerk-users|schema|session)(\/|$)/,
            /^@merit\/[^/]+\/(server|testing|schema|scope|locks)(\/|$)/,
          ],
          files: [
            "**/*.server.*",
            /\/capabilities\/[^/]+\/(?:business\/)?src\/server\//,
            /\/interfaces\/mcp\/src\//,
          ],
        },
      },
    }),
    react({ compiler: reactCompilerOptions }),
  ]),
  ssr: { noExternal: ["zod"] },
  server: { port: devPort, strictPort: true },
  environments: {
    client: { optimizeDeps: { include: clientDependencies } },
  },
  run,
});
