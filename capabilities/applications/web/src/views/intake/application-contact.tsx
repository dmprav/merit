import { useEffect, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { ContactPicker } from "@merit/contacts-web/contacts";
import type { ApplicationView as Application } from "@merit/grantmaking/api";
import { Button } from "@merit/ui/button";
import { PickerPopover } from "@merit/ui/dialog";
import { Inline } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PersonIdentity } from "@merit/ui/person-identity";
import { PropertyButton } from "@merit/ui/property-button";
import { SectionHeader } from "@merit/ui/section-header";
import { useEventToast, useToastWhile } from "@merit/ui/toast";

import type { ApplicationContactData } from "../../contracts/intake";
import { useApplicationContact } from "../../controllers/intake/use-application-contact";
import styles from "./application-contact.module.css";
import { ApplicationDetails } from "./application-details";
import { IntakeEditButton } from "./application-intake";

type ContactSectionProps = {
  data: ApplicationContactData;
  revision: number;
  application: Application;
  isDisabled: boolean;
};

export const ApplicationContact = (props: ContactSectionProps) => {
  const { data, revision, application, isDisabled } = props;
  const { t } = useTranslation(["applicationIntake", "contacts"]);
  const name = application.submission?.contact;
  const [editing, setEditing] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const contact = useApplicationContact(data, application.contactId, revision);
  const { open, saved, canUndo, pending, undoSelection } = contact;
  useEventToast(saved, { tone: "success", message: t("contactSelection.saved") });
  useToastWhile(
    contact.refreshError && {
      tone: "warning",
      message: t(
        contact.refreshError === "saved"
          ? "contactSelection.refreshError"
          : "contactSelection.refreshReadError",
      ),
      action: { label: t("contactSelection.refresh"), onPress: () => void contact.retryRefresh() },
    },
  );
  const { trigger, sectionTrigger } = useContactFocus(contact, editing);

  const editingDisabled = pending || isDisabled;
  const closeDisabled = editingDisabled || open || editingContact;

  const close = () => {
    setEditing(false);
    requestAnimationFrame(() => sectionTrigger.current?.focus());
  };

  const identity = name ? <PersonIdentity name={name} /> : <span>{t("contacts:noContact")}</span>;

  return (
    <section aria-label={t("workspace.details")}>
      <SectionHeader
        title={t("workspace.details")}
        emphasis="quiet"
        aside={
          !editing && (
            <IntakeEditButton
              label={t("intake.editMetadata")}
              isDisabled={editingDisabled}
              onPress={() => setEditing(true)}
              triggerRef={sectionTrigger}
            />
          )
        }
      />
      <div
        role="group"
        aria-label={editing ? t("intake.editMetadata") : undefined}
        onKeyDown={(event) => {
          if (editing && event.key === "Escape" && !closeDisabled) {
            event.stopPropagation();
            close();
          }
        }}
      >
        <ApplicationDetails
          application={application}
          contact={
            editing ? (
              <ContactChoice
                application={application}
                contact={contact}
                workspaceSlug={data.workspaceSlug}
                isDisabled={isDisabled}
                editingContact={editingContact}
                onEditorOpenChange={setEditingContact}
                triggerRef={trigger}
              />
            ) : (
              identity
            )
          }
        />
        {!open && <ContactFeedback {...contact} />}
        {(canUndo || editing) && (
          <div className={styles.actions}>
            <Inline justify={canUndo ? "between" : "end"}>
              {canUndo && (
                <Button
                  variant="quiet"
                  isDisabled={editingDisabled}
                  onPress={() => void undoSelection()}
                >
                  {t("preparation.undo")}
                </Button>
              )}
              {editing && (
                <Button variant="quiet" isDisabled={closeDisabled} onPress={close}>
                  {t("preparation.close")}
                </Button>
              )}
            </Inline>
          </div>
        )}
      </div>
    </section>
  );
};

const useContactFocus = (
  {
    open,
    pending,
    saved,
  }: Pick<ReturnType<typeof useApplicationContact>, "open" | "pending" | "saved">,
  editing: boolean,
) => {
  const trigger = useRef<HTMLButtonElement>(null);
  const sectionTrigger = useRef<HTMLButtonElement>(null);
  const focusedSave = useRef(0);

  useEffect(() => {
    if (!open && !pending && saved !== focusedSave.current) {
      focusedSave.current = saved;
      // The popover may close while refresh still disables its return target.
      if (document.activeElement === document.body) {
        (editing ? trigger : sectionTrigger).current?.focus();
      }
    }
  }, [editing, open, pending, saved]);

  return { trigger, sectionTrigger };
};

const ContactChoice = ({
  application,
  contact,
  workspaceSlug,
  isDisabled,
  editingContact,
  onEditorOpenChange,
  triggerRef,
}: {
  application: Application;
  contact: ReturnType<typeof useApplicationContact>;
  workspaceSlug: string;
  isDisabled: boolean;
  editingContact: boolean;
  onEditorOpenChange: (open: boolean) => void;
  triggerRef: Ref<HTMLButtonElement>;
}) => {
  const { t } = useTranslation(["applicationIntake", "contacts"]);
  const name = application.submission?.contact;
  const label = name
    ? t("contactSelection.changeContactValue", { name })
    : t("contactSelection.changeContact");

  return (
    <PickerPopover
      title={t("contactSelection.changeContact")}
      placement="bottom start"
      isOpen={contact.open}
      onOpenChange={contact.changeOpen}
      isDismissDisabled={contact.pending || editingContact}
      trigger={
        <PropertyButton
          ref={triggerRef}
          action="choose"
          label={label}
          isDisabled={contact.pending || isDisabled}
          autoFocus
        >
          {name ? <PersonIdentity name={name} /> : <span>{t("contacts:noContact")}</span>}
        </PropertyButton>
      }
    >
      <div className={styles.form}>
        <ContactPicker
          direct
          workspaceSlug={workspaceSlug}
          label={t("contactSelection.contact")}
          value={application.contactId}
          isDisabled={contact.pending}
          onChange={(selected) => void contact.selectContact(selected)}
          onEditorOpenChange={onEditorOpenChange}
        />
        <ContactFeedback {...contact} />
      </div>
    </PickerPopover>
  );
};

const ContactFeedback = ({
  failure,
}: Pick<ReturnType<typeof useApplicationContact>, "failure">) => {
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
        <Notice appearance="inline" tone="danger" role="alert">
          {error}
        </Notice>
      )}
    </>
  );
};
