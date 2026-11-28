import { useTranslation } from "react-i18next";

import { useEventToast, useToastWhile } from "@merit/ui/toast";

import type { AiReviewWork } from "./use-ai-review-work";

/** Outcomes that outlive the section: the saved confirmation and a refresh that failed after saving. */
export const AiReviewFeedback = ({ work }: { work: AiReviewWork }) => {
  const { t } = useTranslation("aiReview");
  const { refreshError, saved } = work;
  useEventToast(saved, { tone: "success", message: t("saved") });
  useToastWhile(
    refreshError && {
      tone: "warning",
      message: t(refreshError === "saved" ? "refreshError" : "refreshReadError"),
      action: { label: t("refresh"), onPress: () => void work.refresh() },
    },
  );
  return null;
};
