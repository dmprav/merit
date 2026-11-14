import { bindings, defineConfig } from "cf/config";

import { assertLocalWorkspaceDatabase } from "./local-workspace.config.ts";

export default defineConfig(({ mode }) => {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://merit:merit@127.0.0.1:55432/merit";
  // Validate the real target before the local runtime replaces it with a Hyperdrive address.
  if (mode === "local-workspace") {
    assertLocalWorkspaceDatabase(connectionString);
  }

  return {
    worker: {
      name: "merit",
      compatibilityDate: "2026-11-06",
      compatibilityFlags: ["nodejs_compat"],
      entrypoint: "./src/server.ts",
      observability: {
        enabled: true,
      },
      env: {
        APP_ORIGIN: bindings.text("http://localhost:3000"),
        CLERK_PUBLISHABLE_KEY: bindings.text(""),
        CLERK_ISSUER: bindings.text(""),
        CLERK_SECRET_KEY: bindings.secret(),
        MERIT_OPERATOR_USER_IDS: bindings.text(""),
        EMAIL_FROM: bindings.text("invitations@merit.local"),
        MAILPIT_URL: bindings.text("http://127.0.0.1:8025"),
        RESEND_API_KEY: bindings.secret(),
        OTEL_SERVICE_NAME: bindings.text("merit"),
        OTEL_EXPORTER_OTLP_ENDPOINT: bindings.text(""),
        OTEL_EXPORTER_OTLP_HEADERS: bindings.secret(),
        OTEL_TRACE_FILTER: bindings.text("checkly"),
        HYPERDRIVE: bindings.hyperdrive({
          // Replace with a cache-disabled Hyperdrive configuration before deploying.
          id: "00000000000000000000000000000000",
          dev: {
            connectionString,
          },
        }),
      },
    },
  };
});
