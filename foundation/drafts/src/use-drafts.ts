import { useEffect, useMemo, useSyncExternalStore } from "react";

import { createBrowserDraftSession } from "./browser";
import type { DraftFormat } from "./types";

/**
 * Wait for ready before mounting editors. Omit scope for memory-only previews.
 * Scope and format changes create a fresh store. Failed writes retain input in memory;
 * conflict means another tab's recovery copy was preserved. Save or discard before closing.
 */
export const useDrafts = <T>(scope: string | undefined, kind: string, format: DraftFormat<T>) => {
  const { schema, version } = format;
  const session = useMemo(
    () => createBrowserDraftSession(scope, kind, { schema, version }),
    [scope, kind, schema, version],
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getServerSnapshot,
  );
  useEffect(() => session.mount(), [session]);
  return { ...snapshot, update: session.update };
};
