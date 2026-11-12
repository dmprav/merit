import { sessions } from "./sessions";
import { restoreDrafts, writeDrafts } from "./storage";
import { DraftStore } from "./store";
import type { DraftFormat } from "./types";

export const createBrowserDraftSession = <T>(
  scope: string | undefined,
  kind: string,
  format: DraftFormat<T>,
) => {
  const store = new DraftStore<T>(
    scope
      ? {
          restore: () => restoreDrafts(scope, kind, format),
          write: (epoch, changes) => writeDrafts(scope, kind, epoch, format.version, changes),
        }
      : undefined,
  );

  const mount = () => {
    const unregister = sessions.register(scope, kind, store);

    const beforeUnload = (event: BeforeUnloadEvent) => {
      const { status, drafts } = store.getSnapshot();
      if (
        status === "saving" ||
        status === "conflict" ||
        (status === "unavailable" && Object.values(drafts).some((value) => value !== undefined))
      ) {
        event.preventDefault();
      }
    };

    if (scope) {
      window.addEventListener("beforeunload", beforeUnload);
    }
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      unregister();
    };
  };

  return {
    mount,
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    getServerSnapshot: store.getServerSnapshot,
    update: store.update,
  };
};
