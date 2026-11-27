import { once } from "node:events";
import { createServer } from "node:http";

/** Each release probes its own worker. SIGTERM closes the listener as soon as drain starts. */
export const listenForWorkerReadiness = async (port: number, signal: AbortSignal) => {
  const server = createServer((request, response) => {
    response.writeHead(request.url === "/_ready" ? 204 : 404).end();
  });
  try {
    server.listen({ host: "127.0.0.1", port, signal });
    await once(server, "listening", { signal });
  } catch (error) {
    // Release the abort listener and let the existing worker startup loop log and retry.
    server.close();
    throw error;
  }
};
