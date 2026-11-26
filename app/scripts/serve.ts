import { isIP } from "node:net";
import { fileURLToPath } from "node:url";

import { serve } from "srvx/node";
import { staticMiddleware } from "srvx/static";

import { createDatabasePool } from "@merit/db";
import { shutdownServerTelemetry } from "@merit/telemetry/server";

import application from "../dist/server/server.js";
import { readAppOrigin, readDatabaseUrl } from "../src/server/runtime-config.server.ts";

const { PORT = "3000", TRUSTED_PROXY_IP } = process.env;
if (TRUSTED_PROXY_IP && !isIP(TRUSTED_PROXY_IP)) {
  throw new Error("TRUSTED_PROXY_IP must be the exact address of the ingress.");
}

// Validate the restricted database credential and render the complete public page once,
// before the process begins accepting traffic. Idle health checks need no database query.
await createDatabasePool(readDatabaseUrl())(async () => undefined);
const page = await application.fetch(new Request(readAppOrigin()));
if (page.status !== 200 || !page.headers.get("content-type")?.includes("text/html")) {
  throw new Error("The public page failed its startup check.");
}
await page.arrayBuffer();

const server = serve({
  hostname: "0.0.0.0",
  port: Number(PORT),
  trustProxy: TRUSTED_PROXY_IP ? [TRUSTED_PROXY_IP] : false,
  middleware: [
    staticMiddleware({ dir: fileURLToPath(new URL("../dist/client/", import.meta.url)) }),
  ],
  gracefulShutdown: false,
  fetch(request) {
    if (new URL(request.url).pathname === "/_ready") {
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
    return application.fetch(request);
  },
});

const drain = async () => {
  await server.close();
  await shutdownServerTelemetry();
};

process.once("SIGTERM", () => void drain());
process.once("SIGINT", () => void drain());
