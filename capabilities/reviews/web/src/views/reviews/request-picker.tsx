import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ContactPicker } from "@merit/contacts-web/contacts";
import { isEligibleReviewer } from "@merit/reviews/domain";
import { Button } from "@merit/ui/button";
import { PopoverDialog } from "@merit/ui/dialog";
import { Notice } from "@merit/ui/notice";

import type { ReviewRequest } from "../../contracts/reviews";
import { useReviewRequest } from "../../controllers/reviews/use-review-request";
import { reviewError } from "./messages";
import styles from "./review-work.module.css";

export const RequestPicker = ({
  workspaceSlug,
  trigger,
  disabledContactIds,
  onBegin,
  replacing = false,
  initiallyOpen = false,
  onClose,
}: {
  workspaceSlug: string;
  trigger: ReactNode;
  disabledContactIds: readonly string[];
  onBegin: () => ReviewRequest;
  replacing?: boolean;
  initiallyOpen?: boolean;
  onClose?: () => void;
}) => {
  const { t } = useTranslation("reviews");
  const [editingContact, setEditingContact] = useState(false);
  const { open, pending, error, attempt, choose, changeOpen } = useReviewRequest({
    onBegin,
    initiallyOpen,
    onClose,
  });

  return (
    <PopoverDialog
      title={t(replacing ? "replace" : "request")}
      closeLabel={t("close")}
      placement="bottom end"
      trigger={trigger}
      isOpen={open}
      isDismissDisabled={pending || editingContact}
      onOpenChange={changeOpen}
    >
      <div className={styles.form} aria-busy={pending}>
        <p className={styles.requestHint}>{t("quickRequestHint")}</p>
        <ContactPicker
          isEligible={isEligibleReviewer}
          direct
          isRequired
          workspaceSlug={workspaceSlug}
          label={t("reviewer")}
          value={attempt?.contactId ?? null}
          onChange={(id) => void choose(id)}
          isDisabled={pending}
          disabledContactIds={disabledContactIds}
          onEditorOpenChange={setEditingContact}
        />
        {pending && (
          <p role="status" className={styles.meta}>
            {t("saving")}
          </p>
        )}
        {error && (
          <Notice tone="danger" role="alert">
            {reviewError(t, error)}{" "}
            <Button
              size="small"
              variant="quiet"
              isDisabled={pending}
              onPress={() => void choose(attempt?.contactId ?? null)}
            >
              {t("retry")}
            </Button>
          </Notice>
        )}
      </div>
    </PopoverDialog>
  );
};
