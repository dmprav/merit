import { useTranslation } from "react-i18next";

import type {} from "@merit/i18n";

import styles from "./action-provenance.module.css";

export type ActionProvenanceValue = { interface: "web" } | { interface: "mcp"; clientId: string };

/**
 * Identify the interface that recorded an action beside its actor and time. An MCP client
 * identifier describes provenance; it does not establish individual human review. Keep unknown
 * provenance explicit.
 */
export const ActionProvenance = ({ value }: { value?: ActionProvenanceValue | null }) => {
  const { t } = useTranslation("common");

  return (
    <span className={styles.source}>
      {!value
        ? t("provenance.unknown")
        : value.interface === "web"
          ? t("provenance.web")
          : t("provenance.mcp", { client: value.clientId })}
    </span>
  );
};
