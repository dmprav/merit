import { useTranslation } from "react-i18next";

import type {} from "@merit/i18n";

import styles from "./action-provenance.module.css";

export type ActionProvenanceValue = { interface: "web" } | { interface: "mcp"; clientId: string };

/**
 * Identify the interface that recorded an action beside its actor and time. An MCP client
 * identifier describes provenance; it does not establish individual human review. Beside an
 * actor, only an MCP client is named: Merit web is the usual interface and an unrecorded one adds
 * nothing to the summary. Set detail where the interface is a record's own field, so web and
 * unrecorded interfaces remain explicit there.
 */
export const ActionProvenance = ({
  value,
  detail = false,
}: {
  value?: ActionProvenanceValue | null;
  detail?: boolean;
}) => {
  const { t } = useTranslation("common");

  if (value?.interface !== "mcp" && !detail) {
    return null;
  }

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
