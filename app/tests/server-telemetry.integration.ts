import { once } from "node:events";
import { createServer as createCollector } from "node:http";
import { text } from "node:stream/consumers";

import { createServer, preview } from "vite-plus";
import { expect, it, vi } from "vite-plus/test";

it.each(["dev", "preview"] as const)(
  "exports the final trace when Vite %s closes",
  { timeout: 60000 },
  async (mode) => {
    const batches: string[] = [];
    await using collector = createCollector((request, response) => {
      void text(request).then(
        (body) => {
          batches.push(body);
          response.writeHead(200).end();
        },
        () => response.destroy(),
      );
    });
    collector.listen(0, "127.0.0.1");
    await once(collector, "listening");
    const address = collector.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a local collector port.");
    }

    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", `http://127.0.0.1:${address.port}`);
    vi.stubEnv("OTEL_TRACE_FILTER", "checkly");
    const binding = { host: "127.0.0.1", port: 0 };
    try {
      const server =
        mode === "preview"
          ? await preview({ preview: binding })
          : await (await createServer({ server: binding })).listen();
      const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
      try {
        const response = await fetch(new URL("/mcp", server.resolvedUrls!.local[0]), {
          headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01`, tracestate: "checkly=true" },
        });
        expect(response.status).toBe(404);
        await response.text();
        expect(batches).toEqual([]);
      } finally {
        await server.close();
      }
      expect(batches).toHaveLength(1);
      expect(batches[0]).toContain(traceId);
    } finally {
      vi.unstubAllEnvs();
    }
  },
);
