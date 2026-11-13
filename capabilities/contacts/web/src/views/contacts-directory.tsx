import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { FormDialog } from "@merit/forms";
import { DataTable, type TableColumn } from "@merit/tables";
import { ActionMenu } from "@merit/ui/action-menu";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Inline, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import { PersonIdentity } from "@merit/ui/person-identity";
import { Select } from "@merit/ui/select";
import { StatusMessage } from "@merit/ui/status-message";
import { TextField } from "@merit/ui/text-field";
import { Tooltip } from "@merit/ui/tooltip";

import type { Contact, ContactsData } from "../contracts";
import { useContactsDirectory } from "../controllers/directory";
import { useContactDrafts } from "../controllers/drafts";
import { ContactEditor } from "./contact-editor";
import { ContactHistory } from "./contact-history";
import styles from "./contacts.module.css";

type ContactRow = {
  contact: Contact;
  directoryId: string;
  saving: boolean;
  hasDraft: boolean;
  onEdit: (contact: Contact) => void;
  onArchive: (contact: Contact) => void;
};

// Stable cells keep the history dialog and its focus target mounted during directory updates.
const ContactIdentityCell = (props: Pick<ContactRow, "contact" | "hasDraft" | "onEdit">) => {
  const { t } = useTranslation("contacts");
  const { contact, hasDraft, onEdit } = props;

  return (
    <Stack gap={1} className={styles.identity}>
      <strong>
        <PersonIdentity name={contact.name || contact.email} />
      </strong>
      {(hasDraft ||
        !!contact.historySource ||
        !!contact.history?.length ||
        !!contact.applicationTitles?.length) && (
        <Stack gap={1} className={styles.identityDetails}>
          {(hasDraft || !!contact.historySource || !!contact.history?.length) && (
            <Inline className={styles.identityActions}>
              {(!!contact.historySource || !!contact.history?.length) && (
                <ContactHistory contact={contact} />
              )}
              {hasDraft && (
                <Tooltip content={t("resumeEdit")}>
                  <Button
                    size="small"
                    variant="quiet"
                    iconOnly
                    data-draft
                    aria-label={t("resumeEdit")}
                    onPress={() => onEdit(contact)}
                  >
                    <Icon name="edit" />
                  </Button>
                </Tooltip>
              )}
            </Inline>
          )}
          {!!contact.applicationTitles?.length && (
            <span className={styles.meta}>{contact.applicationTitles.join(", ")}</span>
          )}
        </Stack>
      )}
    </Stack>
  );
};

const ContactActionsCell = (
  props: Pick<ContactRow, "contact" | "directoryId" | "saving" | "onEdit" | "onArchive">,
) => {
  const { t } = useTranslation("contacts");
  const { contact, directoryId, saving, onEdit, onArchive } = props;

  return (
    <ActionMenu
      label={t("contactActions", { person: contact.name || contact.email })}
      trigger={
        <Button
          id={`${directoryId}-${contact.id}`}
          variant="quiet"
          size="small"
          iconOnly
          isDisabled={saving}
          aria-label={t("contactActions", { person: contact.name || contact.email })}
        >
          <Icon name="more" />
        </Button>
      }
      items={[
        { id: "edit", label: t("editContact") },
        { id: "archive", label: t(contact.archived ? "restore" : "archive") },
      ]}
      onAction={(action) => (action === "edit" ? onEdit(contact) : onArchive(contact))}
    />
  );
};

type ContactsDirectoryProps = {
  renderApplicationLink: (record: { publicId: string; title: string }) => ReactNode;
  data: ContactsData;
  workspaceSlug: string;
  contacts: Contact[];
};

export const ContactsDirectory = ({
  data,
  workspaceSlug,
  contacts,
  renderApplicationLink,
}: ContactsDirectoryProps) => {
  const { t } = useTranslation("contacts");
  const directoryId = useId();
  const draftStore = useContactDrafts();
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const work = useContactsDirectory(workspaceSlug, data);
  const { pending: saving, changeArchived, contactSaved } = work;

  const restoreFocus = (contactId?: string) => restoreDirectoryFocus(directoryId, contactId);

  const closeEditor = () => {
    const contactId = editing && editing !== "new" ? editing.id : undefined;
    setEditing(null);
    restoreFocus(contactId);
  };

  const query = search.trim().toLocaleLowerCase();
  const shown = contacts.filter(
    (contact) =>
      contact.archived === archived &&
      `${contact.name} ${contact.email} ${contact.affiliation} ${contact.applicationTitles?.join(" ") ?? ""}`
        .toLocaleLowerCase()
        .includes(query),
  );

  return (
    <div>
      <PageHeader
        title={t("contacts")}
        actions={
          <Button id={`${directoryId}-add`} onPress={() => setEditing("new")}>
            {t(draftStore.has(workspaceSlug) ? "resumeNew" : "addContact")}
          </Button>
        }
      />
      <Stack>
        <DirectoryFilters
          directoryId={directoryId}
          search={search}
          setSearch={setSearch}
          archived={archived}
          setArchived={setArchived}
        />
        <DirectoryFeedback work={work} renderApplicationLink={renderApplicationLink} />
        <ContactsTable
          rows={shown.map((contact) => ({
            contact,
            directoryId,
            saving,
            hasDraft: draftStore.has(workspaceSlug, contact.id),
            onEdit: setEditing,
            // The query can still render the old row after a committed archive-state change.
            onArchive: (item: Contact) =>
              void changeArchived(item).then((changed) =>
                restoreFocus(changed ? undefined : item.id),
              ),
          }))}
          searching={Boolean(query)}
          archived={archived}
          hasContacts={contacts.length > 0}
        />
      </Stack>
      <FormDialog
        isDismissDisabled={pending}
        title={t(editing === "new" ? "addContact" : "editContact")}
        trigger={null}
        closeLabel={t("close")}
        isOpen={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeEditor();
          }
        }}
      >
        {editing && (
          <ContactEditor
            data={data}
            draftStore={draftStore}
            onPending={setPending}
            key={editing === "new" ? "new" : editing.id}
            workspaceSlug={workspaceSlug}
            contact={editing === "new" ? undefined : editing}
            onClose={closeEditor}
            onSaved={() => {
              const contactId = editing === "new" ? undefined : editing.id;
              setEditing(null);
              void contactSaved().then(() => restoreFocus(contactId));
            }}
          />
        )}
      </FormDialog>
    </div>
  );
};

const ContactsTable = ({
  rows,
  searching,
  archived,
  hasContacts,
}: {
  rows: ContactRow[];
  searching: boolean;
  archived: boolean;
  hasContacts: boolean;
}) => {
  const { t } = useTranslation("contacts");
  const columns: TableColumn<ContactRow>[] = [
    {
      id: "name",
      header: t("name"),
      layout: { width: "34%" },
      cell: (record) => <ContactIdentityCell {...record} />,
    },
    {
      id: "affiliation",
      header: t("affiliation"),
      layout: { width: "28%" },
      cell: ({ contact }) =>
        contact.affiliation || <span className={styles.meta}>{t("notProvided")}</span>,
    },
    {
      id: "email",
      header: t("email"),
      cell: ({ contact }) =>
        contact.email || <span className={styles.meta}>{t("notProvided")}</span>,
    },
    {
      id: "actions",
      header: t("actions"),
      layout: { width: "3rem", align: "end", rowActions: true },
      cell: (record) => <ContactActionsCell {...record} />,
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.contact.id}
      label={t("contacts")}
      emptyMessage={t(
        searching
          ? "noMatchingContacts"
          : archived
            ? "noArchivedContacts"
            : !hasContacts
              ? "noContactsYet"
              : "noActiveContacts",
      )}
    />
  );
};

const DirectoryFeedback = ({
  work,
  renderApplicationLink,
}: {
  work: ReturnType<typeof useContactsDirectory>;
  renderApplicationLink: (record: { publicId: string; title: string }) => ReactNode;
}) => {
  const { t } = useTranslation("contacts");
  const { error, refreshError, outstanding, saved, pending: saving, retryRefresh } = work;

  return (
    <>
      {error && (
        <Notice tone="danger" role="alert">
          {t(error === "conflict" ? "conflict" : "error")}
        </Notice>
      )}
      {refreshError && (
        <Notice tone="warning" role="alert">
          {t(refreshError === "saved" ? "refreshError" : "refreshReadError")}{" "}
          <Button variant="quiet" isDisabled={saving} onPress={() => void retryRefresh()}>
            {t("retry")}
          </Button>
        </Notice>
      )}
      {outstanding.length > 0 && (
        <Notice as="div" tone="warning">
          <p>{t("outstandingContacts")}</p>
          <ul>
            {outstanding.map((item) => (
              <li key={item.publicId}>{renderApplicationLink(item)}</li>
            ))}
          </ul>
        </Notice>
      )}
      <StatusMessage
        message={saved ? t("saved") : null}
        eventId={saved}
        confirmation={Boolean(saved)}
      />
    </>
  );
};

const DirectoryFilters = ({
  directoryId,
  search,
  setSearch,
  archived,
  setArchived,
}: {
  directoryId: string;
  search: string;
  setSearch: (value: string) => void;
  archived: boolean;
  setArchived: (value: boolean) => void;
}) => {
  const { t } = useTranslation("contacts");
  const query = search.trim();
  return (
    <div className={styles.toolbar}>
      <div className={styles.searchControls}>
        <TextField
          id={`${directoryId}-search`}
          label={t("search")}
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={setSearch}
        />
        <Button
          variant="quiet"
          size="small"
          isDisabled={!query}
          onPress={() => {
            setSearch("");
            document.getElementById(`${directoryId}-search`)?.focus();
          }}
        >
          {t("clearSearch")}
        </Button>
      </div>
      <Select
        label={t("status")}
        selectedKey={archived ? "archived" : "active"}
        onSelectionChange={(key) => setArchived(key === "archived")}
        items={[
          { id: "active", label: t("active") },
          { id: "archived", label: t("archived") },
        ]}
      />
    </div>
  );
};

const restoreDirectoryFocus = (directoryId: string, contactId?: string) => {
  requestAnimationFrame(() => {
    const target = document.getElementById(`${directoryId}-${contactId ?? "add"}`);
    (target && !target.matches(":disabled")
      ? target
      : document.getElementById(`${directoryId}-add`)
    )?.focus();
  });
};
