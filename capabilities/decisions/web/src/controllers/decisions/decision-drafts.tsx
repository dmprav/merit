import { createKeyedDrafts } from "@merit/drafts";

import type { DecisionBaseline, DecisionDraft } from "../../contracts/decisions";
import { decisionStorage } from "./storage";

const drafts = createKeyedDrafts<DecisionDraft, DecisionBaseline>("decisions", decisionStorage);

export const DraftContext = drafts.DraftContext;
export const useDecisionDraftStore = drafts.useDraftStore;
export const useDecisionDrafts = drafts.useKeyedDrafts;
