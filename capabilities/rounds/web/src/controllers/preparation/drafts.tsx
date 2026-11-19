import { createContext, useContext, useMemo } from "react";

import { useDrafts } from "@merit/drafts";

import type { PreparationDraft } from "./preparation-state";
import { preparationStorage } from "./storage";

export const DraftContext = createContext<{
  ready: boolean;
  edits: Record<string, PreparationDraft | undefined>;
  conflicts: ReadonlySet<string>;
  resolveConflict: (key: string, choice: "keep" | "use_stored") => Promise<void> | void;
  setEdit: (key: string, draft: PreparationDraft | undefined) => void;
} | null>(null);

export const usePreparationDraftStore = (storageScope?: string) => {
  const {
    drafts,
    update: setDrafts,
    storageUnavailable: unavailable,
    ready,
    status,
    conflicts,
    resolveConflict,
  } = useDrafts(storageScope, "rounds", {
    version: 1,
    schema: preparationStorage,
  });

  return {
    unavailable,
    ready,
    status,
    value: useMemo(
      () => ({
        ready,
        edits: drafts,
        conflicts,
        resolveConflict,
        setEdit: (key: string, draft: PreparationDraft | undefined) =>
          setDrafts((current) => ({ ...current, [key]: draft })),
      }),
      [drafts, setDrafts, ready, conflicts, resolveConflict],
    ),
  };
};

export const usePreparationDrafts = () => {
  const context = useContext(DraftContext);
  if (!context) {
    throw new Error("GrantmakingDrafts is required");
  }
  return context;
};
