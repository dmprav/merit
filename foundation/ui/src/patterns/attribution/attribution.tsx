import { useTranslation } from "react-i18next";

import type {} from "@merit/i18n";

import {
  type ActionProvenanceValue,
  ActionProvenance,
} from "../action-provenance/action-provenance";
import { Timestamp } from "../timestamp/timestamp";
import styles from "./attribution.module.css";

/**
 * Who recorded something, through which interface, and when. Pass null for an actor whose name was
 * not recorded; omit provenance or recordedAt where the record does not keep them.
 */
export const Attribution = ({
  actor,
  provenance,
  recordedAt,
}: {
  actor: string | null;
  /** Names an MCP client beside the actor when one was recorded. */
  provenance?: ActionProvenanceValue | null;
  /** An instant, shown in the viewer's local time. */
  recordedAt?: string;
}) => {
  const { t } = useTranslation("common");
  return (
    <div className={styles.attribution}>
      <span>{t("recordedBy", { name: actor ?? t("unknownActor") })}</span>
      {provenance !== undefined && <ActionProvenance value={provenance} />}
      {recordedAt && <Timestamp value={recordedAt} />}
    </div>
  );
};
