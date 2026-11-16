import { useTranslation } from "react-i18next";

import type { ContactHistoryEntry } from "@merit/contacts/api";
import { RemotePagedContent } from "@merit/query/pages";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { DialogContent, ModalDialog } from "@merit/ui/dialog";
import { Inline, Stack } from "@merit/ui/layout";
import { PagedContent } from "@merit/ui/paged-content";
import { Timestamp } from "@merit/ui/timestamp";

import type { Contact } from "../contracts";
import { ContactDetails } from "./contact-details";
import styles from "./contacts.module.css";

export const ContactHistory = ({
  contact,
  isOpen,
  onOpenChange,
}: {
  contact: Contact;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation(["contacts", "common"]);

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("history")}
      context={contact.name || contact.email}
      closeLabel={t("close")}
      trigger={null}
    >
      <DialogContent label={t("history")}>
        <RemotePagedContent
          source={contact.historySource}
          entries={contact.history ?? []}
          active={isOpen}
        >
          {(page) => (
            <PagedContent {...page}>
              {(entries) =>
                entries.length === 0 ? (
                  <p className={styles.meta}>{t("noHistory")}</p>
                ) : (
                  <ol className={styles.history} aria-label={t("history")}>
                    {entries.map((entry) => (
                      <li key={entry.revision}>
                        <Stack gap={3}>
                          <Inline align="baseline" gap={3}>
                            <span>
                              {t("common:recordedBy", { name: entry.actor ?? t("unknownPerson") })}
                            </span>
                            <ActionProvenance value={entry.provenance} />
                            <Timestamp value={entry.recordedAt} />
                          </Inline>
                          <ContactChanges entry={entry} />
                        </Stack>
                      </li>
                    ))}
                  </ol>
                )
              }
            </PagedContent>
          )}
        </RemotePagedContent>
      </DialogContent>
    </ModalDialog>
  );
};

const ContactChanges = ({ entry }: { entry: ContactHistoryEntry }) => {
  const { t } = useTranslation("contacts");
  const { before, after } = entry;
  if (!before) {
    return (
      <div>
        <h3 className={styles.historyLabel}>{t("contactCreated")}</h3>
        <ContactDetails value={after} />
      </div>
    );
  }

  return (
    <>
      <dl className={styles.changes}>
        {(["name", "email", "affiliation", "archived"] as const).map((field) => {
          if (before[field] === after[field]) {
            return null;
          }
          return (
            <div key={field}>
              <dt>{t(field === "archived" ? "status" : field)}</dt>
              <dd>
                <span role="group" aria-label={t("historyBefore")} className={styles.meta}>
                  {field === "archived"
                    ? t(before.archived ? "archived" : "active")
                    : before[field] || t("notProvided")}
                </span>
                <span aria-hidden="true">→</span>
                <span role="group" aria-label={t("historyAfter")}>
                  {field === "archived"
                    ? t(after.archived ? "archived" : "active")
                    : after[field] || t("removed")}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <details className={styles.historyDetails}>
        <summary>{t("savedDetails")}</summary>
        <ContactDetails value={after} />
      </details>
    </>
  );
};
