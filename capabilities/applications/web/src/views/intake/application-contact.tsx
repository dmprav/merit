import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ContactPicker } from "@merit/contacts-web/contacts";
import { Button } from "@merit/ui/button";
import { PopoverDialog } from "@merit/ui/dialog";
import { Notice } from "@merit/ui/notice";
import { PersonIdentity } from "@merit/ui/person-identity";
import { PropertyButton } from "@merit/ui/property-button";
import { StatusMessage } from "@merit/ui/status-message";

import type { ApplicationContactData } from "../../contracts/intake";
import { useApplicationContact } from "../../controllers/intake/use-application-contact";
import styles from "./application-contact.module.css";

export const ApplicationContact = ({
  data,
  revision,
  contactId,
  name,
}: {
  data: ApplicationContactData;
  revision: number;
  contactId: string | null;
  name?: string;
}) => {
  const { t } = useTranslation("applicationIntake");
  const { workspaceSlug } = data;
  const [editingContact, setEditingContact] = useState(false);
  const {
    open,
    changeOpen,
    saved,
    canUndo,
    failure,
    refreshError,
    pending,
    selectContact,
    undoSelection,
    retryRefresh,
  } = useApplicationContact(data, contactId, revision);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusedSave = useRef(0);

  useEffect(() => {
    if (!open && !pending && saved !== focusedSave.current) {
      focusedSave.current = saved;
      // The popover may close while refresh still disables its return target.
      if (document.activeElement === document.body) {
        trigger.current?.focus();
      }
    }
  }, [open, pending, saved]);

  const feedback = (
    <ContactFeedback
      failure={failure}
      refreshError={refreshError}
      pending={pending}
      retryRefresh={retryRefresh}
    />
  );

  return (
    <>
      <PopoverDialog
        title={t("contactSelection.changeContact")}
        closeLabel={t("contactSelection.close")}
        placement="bottom start"
        isOpen={open}
        onOpenChange={changeOpen}
        isDismissDisabled={pending || editingContact}
        trigger={
          <PropertyButton
            ref={trigger}
            action="choose"
            isDisabled={pending}
            label={
              name
                ? t("contactSelection.changeContactValue", { name })
                : t("contactSelection.changeContact")
            }
          >
            {name ? <PersonIdentity name={name} /> : t("contactSelection.changeContact")}
          </PropertyButton>
        }
      >
        <div className={styles.form}>
          <ContactPicker
            direct
            workspaceSlug={workspaceSlug}
            label={t("contactSelection.contact")}
            value={contactId}
            isDisabled={pending}
            onChange={(selected) => void selectContact(selected)}
            onEditorOpenChange={setEditingContact}
          />
          {feedback}
        </div>
      </PopoverDialog>
      {!open && feedback}
      {canUndo && (
        <Button
          size="small"
          variant="quiet"
          isDisabled={pending}
          onPress={() => void undoSelection()}
        >
          {t("preparation.undo")}
        </Button>
      )}
      <StatusMessage
        message={saved ? t("contactSelection.saved") : null}
        eventId={saved}
        confirmation={Boolean(saved)}
      />
    </>
  );
};

const ContactFeedback = ({
  failure,
  refreshError,
  pending,
  retryRefresh,
}: Pick<
  ReturnType<typeof useApplicationContact>,
  "failure" | "refreshError" | "pending" | "retryRefresh"
>) => {
  const { t } = useTranslation("applicationIntake");
  const errors = {
    conflict: "intake.contactConflict",
    not_found: "contactSelection.accessLost",
    signed_out: "contactSelection.accessLost",
    unavailable: "intake.contactSaveError",
  } as const;
  const error = failure
    ? failure.status === "invalid"
      ? t(
          failure.error === "contact_unavailable"
            ? "intake.contactUnavailable"
            : "intake.contactSaveError",
        )
      : t(errors[failure.status])
    : null;

  return (
    <>
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}
      {refreshError && (
        <Notice tone="warning" role="alert">
          {t(
            refreshError === "saved"
              ? "contactSelection.refreshError"
              : "contactSelection.refreshReadError",
          )}{" "}
          <Button variant="quiet" isDisabled={pending} onPress={retryRefresh}>
            {t("contactSelection.retry")}
          </Button>
        </Notice>
      )}
    </>
  );
};
