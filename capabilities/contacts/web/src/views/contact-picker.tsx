import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FormDialog } from "@merit/forms";
import { Button } from "@merit/ui/button";
import { ChoiceList } from "@merit/ui/choice-list";
import { Inline, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { Select } from "@merit/ui/select";

import type { Contact, ContactsData } from "../contracts";
import { useContactDrafts } from "../controllers/drafts";
import { ContactEditor } from "./contact-editor";

type ContactSelectionProps = {
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
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
        <Notice tone="danger">
          {t("error")}{" "}
          <Button variant="quiet" onPress={() => void data.refreshCurrent().catch(() => {})}>
            {t("retry")}
          </Button>
        </Notice>
      )}
      {selection.direct && (
        <Inline>
          <Button
            size="small"
            variant="quiet"
            isDisabled={selection.isDisabled}
            onPress={() => changeEditor(true)}
          >
            {addContactLabel}
          </Button>
        </Inline>
      )}
      <FormDialog
        isDismissDisabled={pending}
        title={t("addContact")}
        trigger={null}
        closeLabel={t("close")}
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
  let selectedKey = value;
  const items = contacts
    .filter((contact) => !contact.archived || contact.id === value)
    .map((contact) => ({
      ...contactOption(contact, direct, t("archived")),
      isDisabled: !canSelect(contact),
    }));
  if (!isRequired) {
    selectedKey = value ?? "none";
    items.unshift({
      id: "none",
      label: emptySelectionLabel ?? t("noContact"),
      isDisabled: false,
    });
  }

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
      />
    );
  }

  return (
    <Select
      label={label}
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
      actions={[{ id: "add", label: addContactLabel, onAction: onCreate }]}
      items={items}
    />
  );
};

const contactOption = (contact: Contact, direct: boolean, archivedLabel: string) => {
  if (direct) {
    return {
      id: contact.id,
      label: contact.name || contact.email,
      description: [
        contact.name ? contact.email : "",
        contact.affiliation,
        contact.archived ? archivedLabel : "",
      ]
        .filter(Boolean)
        .join(", "),
    };
  }

  return {
    id: contact.id,
    label: [
      contact.name,
      contact.email,
      contact.affiliation,
      contact.applicationTitles?.join(", "),
      contact.archived ? archivedLabel : "",
    ]
      .filter(Boolean)
      .join(", "),
  };
};
