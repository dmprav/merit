import { createContext, useContext, useMemo } from "react";

import { useDrafts } from "@merit/drafts";

import type { IntakeDraft } from "./intake-state";
import { intakeStorage } from "./storage";

export const DraftContext = createContext<{
  applicationEdits: Record<string, IntakeDraft | undefined>;
  setApplicationEdit: (key: string, draft: IntakeDraft | undefined) => void;
  migrateApplicationEdits?: (moves: readonly [string, string][]) => void;
} | null>(null);

export const useIntakeDraftStore = (storageScope?: string) => {
  const {
    drafts,
    update: setDrafts,
    storageUnavailable: unavailable,
    ready,
    status,
  } = useDrafts(storageScope, "applications", {
    version: 1,
    schema: intakeStorage,
  });

  return {
    unavailable,
    ready,
    status,
    value: useMemo(
      () => ({
        applicationEdits: drafts,
        setApplicationEdit: (key: string, draft: IntakeDraft | undefined) =>
          setDrafts((current) => ({ ...current, [key]: draft })),
        migrateApplicationEdits: (moves: readonly [string, string][]) =>
          setDrafts((current) => {
            let next: Record<string, IntakeDraft | undefined> | undefined;
            for (const [from, to] of moves) {
              if (current[to] === undefined && current[from] !== undefined) {
                if (!next) {
                  next = { ...current };
                }
                next[to] = current[from];
                next[from] = undefined;
              }
            }
            return next ?? current;
          }),
      }),
      [drafts, setDrafts],
    ),
  };
};

export const useIntakeDrafts = () => {
  const context = useContext(DraftContext);
  if (!context) {
    throw new Error("GrantmakingDrafts is required");
  }
  return context;
};
