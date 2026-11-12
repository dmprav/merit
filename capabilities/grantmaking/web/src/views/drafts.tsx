import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { DraftContext as IntakeContext, useIntakeDraftStore } from "@merit/applications-web/drafts";
import {
  DraftContext as RecommendationContext,
  useRecommendationDraftStore,
} from "@merit/recommendations-web/drafts";
import { DraftContext as ReviewContext, useReviewDraftStore } from "@merit/reviews-web/drafts";
import {
  DraftContext as PreparationContext,
  usePreparationDraftStore,
} from "@merit/rounds-web/drafts";
import { Notice } from "@merit/ui/notice";
import { StateMessage } from "@merit/ui/state-message";

import {
  DraftContext as CreationContext,
  useCreationDraftStore,
} from "../controllers/creation/drafts";

type DraftProps = { children: ReactNode; storageScope?: string };

/** Scope changes reset editing state. Omit the scope for memory-only previews. */
export const GrantmakingDrafts = (props: DraftProps) => (
  <DraftSession key={props.storageScope} {...props} />
);

const DraftSession = ({ children, storageScope }: DraftProps) => {
  const { t } = useTranslation("fundingRounds");
  const preparation = usePreparationDraftStore(storageScope);
  const intake = useIntakeDraftStore(storageScope);
  const creation = useCreationDraftStore(storageScope);
  const recommendation = useRecommendationDraftStore(storageScope);
  const review = useReviewDraftStore(storageScope);
  const stores = [preparation, intake, creation, recommendation, review];
  const ready = stores.every((store) => store.ready);
  const conflict = stores.some((store) => store.status === "conflict");
  const unavailable = stores.some((store) => store.unavailable);

  return (
    <PreparationContext value={preparation.value}>
      <IntakeContext value={intake.value}>
        <CreationContext value={creation.value}>
          <RecommendationContext value={recommendation.value}>
            <ReviewContext value={review.value}>
              {unavailable && (
                <Notice tone="warning">
                  {t(conflict ? "draftRecoveryConflict" : "draftRecoveryUnavailable")}
                </Notice>
              )}
              {ready ? children : <StateMessage title={t("draftsRestoring")} role="status" />}
            </ReviewContext>
          </RecommendationContext>
        </CreationContext>
      </IntakeContext>
    </PreparationContext>
  );
};
