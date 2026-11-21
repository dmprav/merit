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
  const { t } = useTranslation("applicationIntake");
  const name = application.submission?.contact;
  const [editing, setEditing] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const contact = useApplicationContact(data, application.contactId, revision);
  const { open, saved, pending } = contact;
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
              <ContactIdentity name={name} />
            )
          }
        />
        {!open && <ContactFeedback {...contact} />}
        <ContactActions
          canUndo={contact.canUndo}
          editing={editing}
          editingDisabled={editingDisabled}
          closeDisabled={closeDisabled}
          onUndo={() => void contact.undoSelection()}
          onClose={close}
        />
      </div>
    </section>
  );
};

const ContactIdentity = ({ name }: { name?: string }) => {
  const { t } = useTranslation("contacts");
  return name ? <PersonIdentity name={name} /> : <span>{t("noContact")}</span>;
};

const ContactActions = ({
  canUndo,
  editing,
  editingDisabled,
  closeDisabled,
  onUndo,
  onClose,
}: {
  canUndo: boolean;
  editing: boolean;
  editingDisabled: boolean;
  closeDisabled: boolean;
  onUndo: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation("applicationIntake");
  if (!canUndo && !editing) {
    return null;
  }
  return (
    <div className={styles.actions}>
      <Inline justify={canUndo ? "between" : "end"}>
        {canUndo && (
          <Button variant="quiet" isDisabled={editingDisabled} onPress={onUndo}>
            {t("preparation.undo")}
          </Button>
        )}
        {editing && (
          <Button variant="quiet" isDisabled={closeDisabled} onPress={onClose}>
            {t("preparation.close")}
          </Button>
        )}
      </Inline>
    </div>
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
  const { t } = useTranslation("applicationIntake");
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
          <ContactIdentity name={name} />
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
