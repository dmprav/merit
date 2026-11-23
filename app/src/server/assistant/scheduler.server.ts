import type { Actor } from "@merit/auth";
import { reportError } from "@merit/telemetry/errors";

type Work = { userId: string; workspaceSlug: string; id: string };

/** The database owns pending work. This process only owns a bounded set of active drivers. */
export const createAssistantWorker = (
  running: (limit: number, after?: string) => Promise<Work[]>,
  run: (actor: Actor, workspace: string, id: string) => Promise<unknown>,
) => {
  const active = new Set<string>();
  const capacity = 4;
  let pendingScan: symbol | undefined;
  let cursor: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const schedule = ({ userId, workspaceSlug, id }: Work) => {
    if (active.has(id) || active.size >= capacity) {
      return;
    }
    active.add(id);
    void run({ userId }, workspaceSlug, id)
      .catch(() =>
        reportError(new Error("Assistant turn could not advance."), {
          surface: "server",
          operation: "assistant.run",
        }),
      )
      .finally(() => active.delete(id));
  };

  const scan = async () => {
    if (pendingScan || active.size >= capacity) {
      return;
    }
    const scanId = Symbol();
    pendingScan = scanId;
    try {
      const rows = await running(capacity, cursor);
      if (pendingScan !== scanId) {
        return;
      }
      for (const row of rows) {
        if (active.size >= capacity) {
          break;
        }
        schedule(row);
        cursor = row.id;
      }
      if (!rows.length) {
        cursor = undefined;
      }
    } catch {
      reportError(new Error("Assistant pending work could not be read."), {
        surface: "server",
        operation: "assistant.scan",
      });
    } finally {
      if (pendingScan === scanId) {
        pendingScan = undefined;
      }
    }
  };

  return {
    schedule,
    start() {
      if (timer) {
        return;
      }
      timer = setInterval(() => void scan(), 10000);
      timer.unref();
      void scan();
    },
    close() {
      pendingScan = undefined;
      clearInterval(timer);
      timer = undefined;
    },
  };
};
