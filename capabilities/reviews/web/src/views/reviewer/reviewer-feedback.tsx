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
  | "draftInvalid"
  | "submissionInvalid"
  | "submissionSaved";

/**
 * Reports a failed request with a refresh where reloading the assignment can help. Pass
 * offerRefresh=false where a retry beside it already offers the recovery.
 */
export const ReviewerFeedback = ({
  work,
  offerRefresh = true,
}: {
  work: ReviewerWork;
  offerRefresh?: boolean;
}) => {
  const { t } = useTranslation("reviewer");
  const error = work.error as ReviewerErrorKey | null;
  const status = work.page.assignment.status;
  const accessExplained = ["cancelled", "declined", "conflict"].includes(status);
  if (!error || work.conflict || (error === "accessLost" && accessExplained)) {
    return null;
  }
  return (
    <Notice
      appearance="inline"
      role="alert"
      tone="danger"
      actions={
        offerRefresh &&
        error !== "submissionInvalid" &&
        error !== "draftInvalid" && (
          <Button variant="quiet" onPress={() => void work.refresh()}>
            {t("refresh")}
          </Button>
        )
      }
    >
      {t(error)}
    </Notice>
  );
};
