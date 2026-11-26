import { useState } from "react";

import type { DecisionInput } from "@merit/decisions/domain";

import type { DecisionData, DecisionDraft, DecisionFailure } from "../../contracts/decisions";
import { useDecisionDrafts } from "./decision-drafts";

export type DecisionConflict = "record_changed";

export const useDecision = (applicationKey: string, data: DecisionData) => {
  const { drafts, conflicts, resolveConflict, setDraft, ready } = useDecisionDrafts();
  const [saved, setSaved] = useState(0);
  const [draftReset, setDraftReset] = useState(0);
  const draft = drafts[applicationKey];
  const baseline = { expectedRevision: data.revision };
  const storeConflict = conflicts.has(applicationKey);
  const serverConflict = draft ? draft.baseline.expectedRevision !== data.revision : false;
  const conflict: DecisionConflict | null =
    serverConflict || storeConflict ? "record_changed" : null;

  const save = async (value: DecisionInput): Promise<DecisionFailure | null> => {
    try {
      const response = await data.save(value, draft?.baseline ?? baseline);
      if (response.status === "ok") {
        setSaved((count) => count + 1);
        return null;
      }
      return response;
    } catch {
      return { status: "unavailable" };
    }
  };

  return {
    ready,
    draft: draft?.value,
    conflict,
    draftReset,
    saved,
    save,
    updateDraft: (value: DecisionDraft | undefined) => setDraft(applicationKey, value, baseline),
    keepDraft: () => {
      if (!draft) {
        return;
      }
      if (serverConflict) {
        setDraft(applicationKey, draft.value, baseline, true);
      }
      if (storeConflict) {
        void resolveConflict(applicationKey, "keep");
      }
    },
    loadLatest: () => {
      if (storeConflict) {
        void Promise.resolve(resolveConflict(applicationKey, "use_stored")).then(() =>
          setDraftReset((count) => count + 1),
        );
        return;
      }
      setDraft(applicationKey, undefined, baseline, true);
      setDraftReset((count) => count + 1);
    },
  };
};
