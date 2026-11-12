import { useState, useSyncExternalStore } from "react";

import { updateRecommendation, type RoundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import type { RecommendationDraft } from "@merit/recommendations-web/contracts";
import { RecommendationEditor } from "@merit/recommendations-web/work";

import { GrantmakingMessagesProvider } from "../messages";

/** A fictional, in-memory example; leaving the page discards all edits. */
export const RecommendationExample = () => (
  <GrantmakingMessagesProvider>
    <Example />
  </GrantmakingMessagesProvider>
);

const subscribe = () => () => {};

const Example = () => {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [round, setRound] = useState<RoundView>(getExampleRound);
  const [draft, setDraft] = useState<RecommendationDraft>();
  const application = round.applications.find((item) => item.id === "A1")!;

  return (
    <RecommendationEditor
      application={application}
      round={round}
      disabled={!hydrated}
      showActionLabel
      draft={draft}
      onDraftChange={setDraft}
      onSave={(recommendation) => {
        const result = updateRecommendation(
          round,
          application.id,
          recommendation,
          round.snapshotDate,
        );
        if (!result.ok) {
          return { status: "invalid", error: result.error };
        }

        setRound(result.round);
        return null;
      }}
    >
      {({ summary, action, editor }) => (
        <>
          <div>{summary}</div>
          {editor ?? <div>{action}</div>}
        </>
      )}
    </RecommendationEditor>
  );
};
