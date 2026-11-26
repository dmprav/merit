import type { DecisionInput, DecisionVersion } from "@merit/decisions/domain";
import { useDraftEditor } from "@merit/drafts";
import type { ApplicationView as Application } from "@merit/grantmaking/api";

import type { DecisionDraft, DecisionFailure, SaveDecision } from "../../contracts/decisions";
import { decisionDraft } from "./form-state";

export const useDecisionEditor = ({
  application,
  current,
  ready = true,
  draft,
  onDraftChange,
  onSave,
  onClose,
}: {
  application: Application;
  current: DecisionVersion | undefined;
  ready?: boolean;
  draft?: DecisionDraft;
  onDraftChange: (draft: DecisionDraft | undefined) => void;
  onSave: SaveDecision;
  onClose: () => void | Promise<void>;
}) =>
  useDraftEditor<DecisionDraft, DecisionInput, DecisionFailure>({
    initialDraft: decisionDraft(current?.decision ?? null, application.managerRecommendation),
    ready,
    draft,
    onDraftChange,
    onSave,
    onClose,
  });
