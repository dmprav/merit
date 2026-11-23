import { setTimeout as delay } from "node:timers/promises";

import { assistantJson } from "./http.server";

type Snapshot = { revision: number; status: string };

/** Observe committed progress. Closing this response only detaches its reader. */
export const watchAssistant = async (
  open: () => Promise<Snapshot | null>,
  requestSignal: AbortSignal,
) => {
  const initial = await open();
  if (!initial) {
    return assistantJson({ status: "not_found" }, 404);
  }

  const reader = new AbortController();
  const signal = AbortSignal.any([reader.signal, requestSignal]);
  const encoder = new TextEncoder();

  const event = (name: string, data: unknown) =>
    encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

  const changes = async function* () {
    let snapshot: Snapshot | null = initial;
    let revision = -1;
    try {
      while (!signal.aborted && snapshot) {
        if (snapshot.revision !== revision) {
          yield event("conversation", snapshot);
          revision = snapshot.revision;
        }
        if (snapshot.status !== "running") {
          return;
        }
        await delay(750, undefined, { signal });
        snapshot = await open();
      }
      if (!signal.aborted) {
        yield event("unavailable", {});
      }
    } catch {
      if (!signal.aborted) {
        yield event("unavailable", {});
      }
    }
  };

  const events = changes();
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await events.next();
        if (next.done) {
          controller.close();
        } else {
          controller.enqueue(next.value);
        }
      },
      async cancel() {
        reader.abort();
        await events.return(undefined);
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "private, no-store",
        "X-Accel-Buffering": "no",
      },
    },
  );
};
