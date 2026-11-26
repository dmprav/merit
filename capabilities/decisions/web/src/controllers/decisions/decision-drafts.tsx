import { createContext, useContext, useMemo } from "react";

import { useDrafts } from "@merit/drafts";

import type { DecisionBaseline, DecisionDraft } from "../../contracts/decisions";
import { decisionStorage } from "./storage";

type Draft = { value: DecisionDraft; baseline: DecisionBaseline };

export const DraftContext = createContext<{
  ready: boolean;
  drafts: Record<string, Draft | undefined>;
  conflicts: ReadonlySet<string>;
  resolveConflict: (key: string, choice: "keep" | "use_stored") => Promise<void> | void;
  setDraft: (
    key: string,
    value: DecisionDraft | undefined,
    baseline: DecisionBaseline,
    replaceBaseline?: boolean,
  ) => void;
  clearDrafts: () => void;
} | null>(null);

export const useDecisionDraftStore = (storageScope?: string) => {
  const {
    drafts,
    update: setDrafts,
    storageUnavailable: unavailable,
    ready,
    status,
    conflicts,
    resolveConflict,
  } = useDrafts(storageScope, "decisions", { version: 1, schema: decisionStorage });

  return {
    unavailable,
    ready,
    status,
    value: useMemo(
      () => ({
        ready,
        drafts,
        conflicts,
        resolveConflict,
        setDraft: (
          key: string,
          value: DecisionDraft | undefined,
          baseline: DecisionBaseline,
          replaceBaseline = false,
        ) =>
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

export const useDecisionDrafts = () => {
  const value = useContext(DraftContext);
  if (!value) {
    throw new Error("GrantmakingDrafts is required");
  }
  return value;
};
