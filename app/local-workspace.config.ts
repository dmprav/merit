import type { Plugin } from "vite-plus";

export const assertLocalWorkspaceDatabase = (connectionString: string) => {
  const url = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("Local workspace requires a loopback PostgreSQL database.");
  }
};

// Select the fixture adapter only in the dev server; builds always use real authentication.
export const localWorkspace = (): Plugin => {
  let enabled = false;

  return {
    name: "merit-local-workspace",
    config(config, { command, mode, isPreview }) {
      enabled = mode === "local-workspace";
      if (enabled && (command !== "serve" || isPreview)) {
        throw new Error("Local workspace mode is only available in the development server.");
      }
      if (enabled && config.server?.host !== undefined && config.server.host !== "127.0.0.1") {
        throw new Error("Local workspace must listen on 127.0.0.1.");
      }

      return {
        define: { "import.meta.env.MERIT_LOCAL_WORKSPACE": JSON.stringify(enabled) },
        ...(enabled ? { server: { host: "127.0.0.1", allowedHosts: ["localhost"] } } : {}),
      };
    },
    configResolved(config) {
      if (enabled && config.server.host !== "127.0.0.1") {
        throw new Error("Local workspace must listen on 127.0.0.1.");
      }
      // Cloudflare has now loaded CLOUDFLARE_* values from process environment and .env files.
      if (enabled && process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE) {
        throw new Error(
          "Local workspace does not accept a Hyperdrive connection override. Use DATABASE_URL.",
        );
      }
    },
  };
};
