import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { FormDialog } from "@merit/forms";
import { RemotePagedContent } from "@merit/query/pages";
import { DataTable, type TableColumn } from "@merit/tables";
import { ActionMenu } from "@merit/ui/action-menu";
import { Button } from "@merit/ui/button";
import { CollectionFilter, CollectionToolbar } from "@merit/ui/collection-toolbar";
import { DialogContent, SidePanel } from "@merit/ui/dialog";
import { Icon } from "@merit/ui/icon";
import { Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import { PagedContent } from "@merit/ui/paged-content";
import { PersonIdentity } from "@merit/ui/person-identity";
import { Text } from "@merit/ui/text";
import { useEventToast, useToastWhile } from "@merit/ui/toast";

import type { Contact, ContactApplication, ContactsData } from "../contracts";
import { useContactsDirectory } from "../controllers/directory";
import { useContactDrafts } from "../controllers/drafts";
import { ContactEditor } from "./contact-editor";
import styles from "./contacts.module.css";

type ContactRow = {
  contact: Contact;
  directoryId: string;
  saving: boolean;
  hasDraft: boolean;
  renderApplicationLink: ContactsDirectoryProps["renderApplicationLink"];
  onEdit: (contact: Contact) => void;
  onArchive: (contact: Contact) => void;
};

// Stable cells keep dialogs and their focus targets mounted during directory updates.
const ContactIdentityCell = ({ contact }: Pick<ContactRow, "contact">) => (
  <PersonIdentity name={contact.name || contact.email} />
);

const ContactApplicationsCell = ({
  contact,
  renderApplicationLink,
}: Pick<ContactRow, "contact" | "renderApplicationLink">) => {
  const { t } = useTranslation("contacts");
  const [open, setOpen] = useState(false);
  const titles = contact.applicationTitles ?? [];
  if (titles.length === 0) {
    return (
      <span role="img" aria-label={t("noApplications")}>
        <Text variant="missing">—</Text>
      </span>
    );
  }

  if (!contact.applicationsSource) {
    return <Text variant="supporting">{t("applicationCount", { count: titles.length })}</Text>;
  }

  return (
    <SidePanel
      isOpen={open}
      onOpenChange={setOpen}
      title={t("applicationsFor", { person: contact.name || contact.email })}
      trigger={<Button variant="quiet">{t("applicationCount", { count: titles.length })}</Button>}
    >
      <DialogContent>
        <RemotePagedContent source={contact.applicationsSource} entries={[]} active={open}>
          {(page) => (
            <PagedContent
              {...page}
              labels={{
                loading: t("applicationsLoading"),
                failed: t("applicationsFailed"),
                unavailable: t("applicationsUnavailable"),
                more: t("applicationsMore"),
              }}
            >
              {(entries) =>
                entries.length === 0 ? (
                  <Text as="p" variant="missing">
                    {t("noApplications")}
                  </Text>
                ) : (
                  <Stack as="ul" gap={0} divided="between">
                    {entries.map((application) => (
                      <li key={application.publicId}>
                        {renderApplicationLink(
                          application,
                          <>
                            <span>{application.title}</span>{" "}
                            <Text variant="supporting">
                              {t("applicationContext", {
                                relationships: application.relationships
                                  .map((relationship) =>
                                    t(`applicationRelationships.${relationship}`),
                                  )
                                  .join(", "),
                                round: application.roundTitle,
                              })}
                            </Text>
                          </>,
                          { variant: "row" },
                        )}
                      </li>
                    ))}
                  </Stack>
                )
              }
            </PagedContent>
          )}
        </RemotePagedContent>
      </DialogContent>
    </SidePanel>
  );
};

const ContactActionsCell = (
  props: Pick<
    ContactRow,
    "contact" | "directoryId" | "saving" | "hasDraft" | "onEdit" | "onArchive"
  >,
) => {
  const { t } = useTranslation("contacts");
  const { contact, directoryId, saving, hasDraft, onEdit, onArchive } = props;
  const draftDescription = useId();

  return (
    <>
      {hasDraft && (
        <span id={draftDescription} hidden>
          {t("resumeEdit")}
        </span>
      )}
      <ActionMenu
        label={t("contactActions", { person: contact.name || contact.email })}
        trigger={
          <Button
            id={`${directoryId}-${contact.id}`}
            variant="quiet"
            iconOnly
            data-draft={hasDraft || undefined}
            aria-describedby={hasDraft ? draftDescription : undefined}
            isDisabled={saving}
            aria-label={t("contactActions", { person: contact.name || contact.email })}
          >
            <Icon name="more" />
          </Button>
        }
        items={[
          { id: "edit", label: t(hasDraft ? "resumeEdit" : "editContact") },
          { id: "archive", label: t(contact.archived ? "restore" : "archive") },
        ]}
        onAction={(action) => {
          if (action === "edit") {
            onEdit(contact);
          } else {
            onArchive(contact);
          }
        }}
      />
    </>
  );
};

type ContactsDirectoryProps = {
  renderApplicationLink: (
    record: Pick<ContactApplication, "publicId" | "title">,
    children: ReactNode,
    /** row presents a whole list row; tab opens the application at that section. */
    link: { variant: "inline" | "row"; tab?: "reviews" },
  ) => ReactNode;
  data: ContactsData;
  workspaceSlug: string;
  contacts: Contact[];
};

const useContactsFocusRestore = ({
  directoryId,
  blocked,
}: {
  directoryId: string;
  blocked: boolean;
}) => {
  const restoreTargetRef = useRef<string | null | undefined>(undefined);
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (blocked || restoreTargetRef.current === undefined) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const contactId = restoreTargetRef.current;
      restoreTargetRef.current = undefined;

      if (contactId === undefined) {
        return;
      }

      const target = document.getElementById(`${directoryId}-${contactId ?? "add"}`);
      (target && !target.matches(":disabled")
        ? target
        : document.getElementById(`${directoryId}-add`)
      )?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [blocked, directoryId, focusRequest]);

  return (contactId?: string) => {
    restoreTargetRef.current = contactId ?? null;
    setFocusRequest((count) => count + 1);
  };
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
  const restoreFocus = useContactsFocusRestore({
    directoryId,
    blocked: saving || editing !== null || pending,
  });

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
          <Button id={`${directoryId}-add`} variant="secondary" onPress={() => setEditing("new")}>
            <Icon name="add" />
            {t(draftStore.has(workspaceSlug) ? "resumeNew" : "addContact")}
          </Button>
        }
      />
      <DirectoryFilters
        count={shown.length}
        search={search}
        setSearch={setSearch}
        archived={archived}
        setArchived={setArchived}
      />
      <DirectoryFeedback work={work} renderApplicationLink={renderApplicationLink} />
      <ContactsTable
        rows={shown.map((contact) => ({
          contact,
          renderApplicationLink,
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
      <FormDialog
        isDismissDisabled={pending}
        title={t(editing === "new" ? "addContact" : "editContact")}
        trigger={null}
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
      layout: { width: "28%" },
      cell: (record) => <ContactIdentityCell {...record} />,
    },
    {
      id: "affiliation",
      header: t("affiliation"),
      layout: { width: "24%" },
      cell: ({ contact }) =>
        contact.affiliation || <Text variant="missing">{t("notProvided")}</Text>,
    },
    {
      id: "email",
      header: t("email"),
      cell: ({ contact }) => contact.email || <Text variant="missing">{t("notProvided")}</Text>,
    },
    {
      id: "applications",
      header: t("applications"),
      layout: { width: "10rem" },
      cell: (record) => <ContactApplicationsCell {...record} />,
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
      density="compact"
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
  renderApplicationLink: ContactsDirectoryProps["renderApplicationLink"];
}) => {
  const { t } = useTranslation("contacts");
  const { error, refreshError, outstanding, saved, retryRefresh } = work;
  useEventToast(saved, { tone: "success", message: t("saved") });
  useToastWhile(
    refreshError && {
      tone: "warning",
      message: t(refreshError === "saved" ? "refreshError" : "refreshReadError"),
      action: { label: t("refresh"), onPress: () => void retryRefresh() },
    },
  );

  return (
    <>
      {(error || refreshError || outstanding.length > 0) && (
        <div className={styles.feedback}>
          <Stack gap={3}>
            {error && (
              <Notice tone="danger" role="alert">
                {t(error === "conflict" ? "conflict" : "error")}
              </Notice>
            )}
            {outstanding.length > 0 && (
              <Notice as="div" tone="warning">
                <p>{t("outstandingContacts")}</p>
                <ul>
                  {outstanding.map((item) => (
                    <li key={item.publicId}>
                      {renderApplicationLink(item, item.title, {
                        variant: "inline",
                        tab: "reviews",
                      })}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
          </Stack>
        </div>
      )}
    </>
  );
};

const DirectoryFilters = ({
  count,
  search,
  setSearch,
  archived,
  setArchived,
}: {
  count: number;
  search: string;
  setSearch: (value: string) => void;
  archived: boolean;
  setArchived: (value: boolean) => void;
}) => {
  const { t } = useTranslation("contacts");
  return (
    <CollectionToolbar
      filterLabel={t("filter")}
      filterTitle={t("filterContacts")}
      summary={t("contactCount", { count })}
      search={{
        label: t("search"),
        clearLabel: t("clearSearch"),
        placeholder: t("searchPlaceholder"),
        value: search,
        onChange: setSearch,
      }}
      chips={
        archived
          ? [
              {
                id: "archived",
                label: t("archived"),
                removeLabel: t("removeArchivedFilter"),
                onRemove: () => setArchived(false),
              },
            ]
          : []
      }
      reset={{
        label: t("resetFilters"),
        isDisabled: !archived && !search,
        onReset: () => {
          setArchived(false);
          setSearch("");
        },
      }}
      filters={
        <CollectionFilter
          label={t("status")}
          selectedKey={archived ? "archived" : "active"}
          onSelectionChange={(key) => setArchived(key === "archived")}
          items={[
            { id: "active", label: t("active") },
            { id: "archived", label: t("archived") },
          ]}
        />
      }
    />
  );
};
