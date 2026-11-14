import { createContext, useContext, useMemo } from "react";

import { useDrafts } from "@merit/drafts";

import type { CreationDraft } from "../../contracts/creation";
import { creationStorage } from "./storage";

export const DraftContext = createContext<{
  ready: boolean;
  creations: Record<string, CreationDraft | undefined>;
  setCreation: (key: string, draft: CreationDraft | undefined) => void;
} | null>(null);

export const useCreationDraftStore = (storageScope?: string) => {
  const {
    drafts,
    update: setDrafts,
    storageUnavailable: unavailable,
    ready,
    status,
  } = useDrafts(storageScope, "creations", { version: 1, schema: creationStorage });

  return {
    unavailable,
    ready,
    status,
    value: useMemo(
      () => ({
        ready,
        creations: drafts,
        setCreation: (key: string, draft: CreationDraft | undefined) =>
          setDrafts((current) => ({ ...current, [key]: draft })),
      }),
      [drafts, setDrafts, ready],
    ),
  };
};

export const useCreationDrafts = () => {
  const context = useContext(DraftContext);
  if (!context) {
    throw new Error("GrantmakingDrafts is required");
  }
  return context;
};
