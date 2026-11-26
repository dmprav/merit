import { createContext, useContext, useMemo } from "react";
import type { z } from "zod";

import { useDrafts } from "./use-drafts";

type Stored<Draft, Baseline> = { value: Draft; baseline: Baseline };

type KeyedDraftContext<Draft, Baseline> = {
  ready: boolean;
  drafts: Record<string, Stored<Draft, Baseline> | undefined>;
  conflicts: ReadonlySet<string>;
  resolveConflict: (key: string, choice: "keep" | "use_stored") => Promise<void> | void;
  setDraft: (
    key: string,
    value: Draft | undefined,
    baseline: Baseline,
    replaceBaseline?: boolean,
  ) => void;
  clearDrafts: () => void;
};

/**
 * A draft store for one writing workflow whose drafts are keyed by record and keep the
 * baseline they were started from. `setDraft` keeps the original baseline unless asked to
 * replace it, so a server change is detected against what the person began editing.
 * Returns the context to provide, the hook that owns the store, and the hook that reads it.
 */
export const createKeyedDrafts = <Draft, Baseline>(
  kind: string,
  schema: z.ZodType<Stored<Draft, Baseline>>,
) => {
  const DraftContext = createContext<KeyedDraftContext<Draft, Baseline> | null>(null);

  const useDraftStore = (storageScope?: string) => {
    const {
      drafts,
      update: setDrafts,
      storageUnavailable: unavailable,
      ready,
      status,
      conflicts,
      resolveConflict,
    } = useDrafts(storageScope, kind, { version: 1, schema });

    return {
      unavailable,
      ready,
      status,
      value: useMemo<KeyedDraftContext<Draft, Baseline>>(
        () => ({
          ready,
          drafts,
          conflicts,
          resolveConflict,
          setDraft: (key, value, baseline, replaceBaseline = false) =>
            setDrafts((current) => ({
              ...current,
              [key]: value
                ? {
                    value,
                    baseline: replaceBaseline ? baseline : (current[key]?.baseline ?? baseline),
                  }
                : undefined,
            })),
          clearDrafts: () => setDrafts(() => ({})),
        }),
        [drafts, setDrafts, ready, conflicts, resolveConflict],
      ),
    };
  };

  const useKeyedDrafts = () => {
    const value = useContext(DraftContext);
    if (!value) {
      throw new Error(`The ${kind} drafts provider is required`);
    }
    return value;
  };

  return { DraftContext, useDraftStore, useKeyedDrafts };
};
