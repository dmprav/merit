import { createContext, useContext, useMemo } from "react";

import { useDrafts } from "@merit/drafts";

import type { IntakeDraft } from "./intake-state";
import { intakeStorage } from "./storage";

export const DraftContext = createContext<{
  applicationEdits: Record<string, IntakeDraft | undefined>;
  setApplicationEdit: (key: string, draft: IntakeDraft | undefined) => void;
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
