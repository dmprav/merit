import { useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import { Notice } from "@merit/ui/notice";

import type { useReviewer } from "../../controllers/reviewer/use-reviewer";

export type ReviewerWork = ReturnType<typeof useReviewer>;

export type ReviewerErrorKey =
  | "unavailable"
  | "accessLost"
  | "saveConflict"
  | "stale"
  | "expired"
  | "applicationWithdrawn"
  | "submissionInvalid"
  | "submissionSaved";

/** Reports a failed request with a refresh where reloading the assignment can help. */
export const ReviewerFeedback = ({ work }: { work: ReviewerWork }) => {
  const { t } = useTranslation("reviewer");
  const error = work.error as ReviewerErrorKey | null;
  if (!error || work.conflict) {
    return null;
  }
  return (
    <Notice role="alert" tone="danger">
      {t(error)}{" "}
      {error !== "submissionInvalid" && (
        <Button variant="quiet" onPress={() => void work.refresh()}>
          {t("refresh")}
        </Button>
      )}
    </Notice>
  );
};
