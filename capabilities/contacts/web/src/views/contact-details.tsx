import { useTranslation } from "react-i18next";

import type { ContactDetails as Details } from "@merit/contacts/domain";
import { Badge } from "@merit/ui/badge";

import styles from "./contacts.module.css";

type SavedDetails = Details & { archived?: boolean };

/** Saved contact values; a known comparison marks changed fields without hiding unchanged facts. */
export const ContactDetails = ({
  value,
  comparison,
}: {
  value: SavedDetails;
  comparison?: SavedDetails | null;
}) => {
  const { t } = useTranslation("contacts");

  return (
    <dl className={styles.savedDetails}>
      {(["name", "email", "affiliation", "archived"] as const).map((field) => {
        if (field === "archived" && value.archived === undefined) {
          return null;
        }

        return (
          <div key={field}>
            <dt>
              <span>{t(field === "archived" ? "status" : field)}</span>
              {comparison && value[field] !== comparison[field] && <Badge>{t("changed")}</Badge>}
            </dt>
            <dd>
              {field === "archived"
                ? t(value.archived ? "archived" : "active")
                : value[field] || t("notProvided")}
            </dd>
          </div>
        );
      })}
    </dl>
  );
};
