import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FormDialog } from "@merit/forms";
import { Button } from "@merit/ui/button";
import { ChoiceList } from "@merit/ui/choice-list";
import { Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { Select } from "@merit/ui/select";

import type { Contact, ContactsData } from "../contracts";
import { useContactDrafts } from "../controllers/drafts";
import { ContactEditor } from "./contact-editor";

type ContactSelectionProps = {
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
  /** Keeps the select's label for assistive technology when surrounding content already names it. */
  isLabelHidden?: boolean;
  error?: string;
  isDisabled?: boolean;
  autoFocus?: boolean;
  onBlur?: () => void;
  direct?: boolean;
  emptySelectionLabel?: string;
  isRequired?: boolean;
};

type ContactPickerProps = ContactSelectionProps & {
  data: ContactsData;
  workspaceSlug: string;
  onEditorOpenChange?: (open: boolean) => void;
  disabledContactIds?: readonly string[];
  isEligible?: (contact: Contact) => boolean;
};

export const ContactPicker = ({
  data,
  workspaceSlug,
  onChange,
  onEditorOpenChange,
  disabledContactIds = [],
  isEligible,
  ...selection
}: ContactPickerProps) => {
  const { t } = useTranslation("contacts");
  const draftStore = useContactDrafts();
  const [pending, setPending] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectionUnavailable, setSelectionUnavailable] = useState(false);

  const changeEditor = (open: boolean) => {
    setEditorOpen(open);
    onEditorOpenChange?.(open);
  };

  const canSelect = (contact: Contact) =>
    !contact.archived &&
    !disabledContactIds.includes(contact.id) &&
    isEligible?.(contact) !== false;

  const selectContact = (id: string | null) => {
    setSelectionUnavailable(false);
    onChange(id);
  };

  const addContactLabel = t(draftStore.has(workspaceSlug) ? "resumeNew" : "addContact");

  return (
    <Stack>
      <ContactSelection
        {...selection}
        contacts={data.contacts}
        canSelect={canSelect}
        onChange={selectContact}
        addContactLabel={addContactLabel}
        onCreate={() => changeEditor(true)}
      />

      {selectionUnavailable && (
        <Notice tone="warning" role="alert">
          {t("savedContactUnavailable")}
        </Notice>
      )}
      {data.readFailed && (
        <Notice
          appearance="inline"
          tone="danger"
          role="alert"
          actions={
            <Button variant="quiet" onPress={() => void data.refreshCurrent().catch(() => {})}>
              {t("retry")}
            </Button>
          }
        >
          {t("loadError")}
        </Notice>
      )}
      <FormDialog
        isDismissDisabled={pending}
        title={t("addContact")}
        trigger={null}
        isOpen={editorOpen}
        onOpenChange={(open) => {
          if (!open) {
            changeEditor(false);
          }
        }}
      >
        {editorOpen && (
          <ContactEditor
            data={data}
            draftStore={draftStore}
            onPending={setPending}
            workspaceSlug={workspaceSlug}
            onClose={() => changeEditor(false)}
            onSaved={(contact) => {
              const selectable = canSelect(contact);
              setSelectionUnavailable(!selectable);
              if (selectable && contact.id !== selection.value) {
                onChange(contact.id);
              }
              changeEditor(false);
            }}
          />
        )}
      </FormDialog>
    </Stack>
  );
};

const ContactSelection = ({
  contacts,
  value,
  onChange,
  label,
  isLabelHidden,
  error,
  isDisabled,
  autoFocus,
  onBlur,
  direct = false,
  emptySelectionLabel,
  isRequired = false,
  canSelect,
  addContactLabel,
  onCreate,
}: ContactSelectionProps & {
  contacts: Contact[];
  canSelect: (contact: Contact) => boolean;
  addContactLabel: string;
  onCreate: () => void;
}) => {
  const { t } = useTranslation("contacts");
  const { items, selectedKey } = contactChoices({
    contacts,
    value,
    archivedLabel: t("archived"),
    canSelect,
    isRequired,
    emptyLabel: emptySelectionLabel ?? t("noContact"),
  });

  const choose = (id: string) => onChange(id === "none" ? null : id);

  if (direct) {
    return (
      <ChoiceList
        label={label}
        searchLabel={t("search")}
        emptyLabel={t("emptyContacts")}
        selectedKey={selectedKey}
        isDisabled={isDisabled}
        items={items}
        onChoose={choose}
        actions={[{ id: "add", label: addContactLabel, icon: "add", onAction: onCreate }]}
      />
    );
  }

  return (
    <Select
      label={label}
      isLabelHidden={isLabelHidden}
      isRequired={isRequired}
      placeholder={emptySelectionLabel}
      isDisabled={isDisabled}
      autoFocus={autoFocus}
      onBlur={onBlur}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      errorMessage={<span role="alert">{error}</span>}
      selectedKey={selectedKey}
      onSelectionChange={choose}
      actions={[{ id: "add", label: addContactLabel, icon: "add", onAction: onCreate }]}
      items={items}
    />
  );
};

/** Both presentations show the same option: the name, then what tells similar contacts apart. */
const contactOption = (contact: Contact, archivedLabel: string) => ({
  id: contact.id,
  label: contact.name || contact.email,
  description: [
    contact.name ? contact.email : "",
    contact.affiliation,
    contact.applicationTitles?.join(", "),
    contact.archived ? archivedLabel : "",
  ]
    .filter(Boolean)
    .join(", "),
});

const contactChoices = ({
  contacts,
  value,
  archivedLabel,
  canSelect,
  isRequired,
  emptyLabel,
}: {
  contacts: Contact[];
  value: string | null;
  archivedLabel: string;
  canSelect: (contact: Contact) => boolean;
  isRequired: boolean;
  emptyLabel: string;
}) => {
  const items = contacts
    .filter((contact) => !contact.archived || contact.id === value)
    .map((contact) => ({
      ...contactOption(contact, archivedLabel),
      isDisabled: !canSelect(contact),
    }));
  if (isRequired) {
    return { items, selectedKey: value };
  }
  return {
    items: [{ id: "none", label: emptyLabel, isDisabled: false }, ...items],
    selectedKey: value ?? "none",
  };
};
