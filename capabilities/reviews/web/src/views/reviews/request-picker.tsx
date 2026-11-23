import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ContactPicker } from "@merit/contacts-web/contacts";
import { isEligibleReviewer } from "@merit/reviews/domain";
import { Button } from "@merit/ui/button";
import { PickerPopover } from "@merit/ui/dialog";
import { Notice } from "@merit/ui/notice";
import { Text } from "@merit/ui/text";

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
    <PickerPopover
      title={t(replacing ? "replace" : "request")}
      placement="bottom end"
      trigger={trigger}
      isOpen={open}
      isDismissDisabled={pending || editingContact}
      onOpenChange={changeOpen}
    >
      <div className={styles.picker} aria-busy={pending}>
        {/* Explains the choice before it is made. */}
        <div className={styles.pickerHint}>
          <Text as="p" variant="caption">
            {t("quickRequestHint")}
          </Text>
        </div>
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
          <div role="status">
            <Text as="p" variant="supporting">
              {t("saving")}
            </Text>
          </div>
        )}
        {error && (
          <Notice
            appearance="inline"
            tone="danger"
            role="alert"
            actions={
              <Button
                variant="quiet"
                isDisabled={pending}
                onPress={() => void choose(attempt?.contactId ?? null)}
              >
                {t("retry")}
              </Button>
            }
          >
            {reviewError(t, error)}
          </Notice>
        )}
      </div>
    </PickerPopover>
  );
};
