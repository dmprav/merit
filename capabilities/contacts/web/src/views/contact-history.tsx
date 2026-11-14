import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { RemotePagedContent } from "@merit/query/pages";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { Button } from "@merit/ui/button";
import { DialogContent, ModalDialog } from "@merit/ui/dialog";
import { Inline, Stack } from "@merit/ui/layout";
import { PagedContent } from "@merit/ui/paged-content";

import type { Contact } from "../contracts";
import { ContactDetails } from "./contact-details";
import styles from "./contacts.module.css";

export const ContactHistory = ({ contact }: { contact: Contact }) => {
  const { t } = useTranslation(["contacts", "common"]);
  const [open, setOpen] = useState(false);
  const { formatLocale } = useLocaleSettings();

  return (
    <ModalDialog
      onOpenChange={setOpen}
      title={t("history")}
      context={contact.name || contact.email}
      closeLabel={t("close")}
      size="wide"
      trigger={
        <Button
          variant="quiet"
          size="small"
          aria-label={t("historyFor", { person: contact.name || contact.email })}
        >
          {t("history")}
        </Button>
      }
    >
      <DialogContent label={t("history")}>
        <RemotePagedContent
          source={contact.historySource}
          entries={contact.history ?? []}
          active={open}
        >
          {(page) => (
            <PagedContent {...page}>
              {(entries) => (
                <ol className={styles.history} aria-label={t("history")}>
                  {entries.map((entry) => (
                    <li key={entry.revision}>
                      <Stack gap={3}>
                        <Inline align="baseline" gap={3}>
                          <span>
                            {t("common:recordedBy", { name: entry.actor ?? t("unknownPerson") })}
                          </span>
                          <ActionProvenance value={entry.provenance} />
                          <time dateTime={entry.recordedAt}>
                            {new Date(entry.recordedAt).toLocaleString(formatLocale, {
                              timeZone: "UTC",
                            })}{" "}
                            UTC
                          </time>
                        </Inline>
                        <div className={styles.historyComparison}>
                          {entry.before && (
                            <div role="group" aria-label={t("historyBefore")}>
                              <h3>{t("historyBefore")}</h3>
                              <ContactDetails value={entry.before} comparison={entry.after} />
                            </div>
                          )}
                          <div role="group" aria-label={t("historyAfter")}>
                            <h3>{t("historyAfter")}</h3>
                            <ContactDetails value={entry.after} comparison={entry.before} />
                          </div>
                        </div>
                      </Stack>
                    </li>
                  ))}
                </ol>
              )}
            </PagedContent>
          )}
        </RemotePagedContent>
      </DialogContent>
    </ModalDialog>
  );
};
