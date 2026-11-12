import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { RoundView } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { parseMoneyInput } from "@merit/money/input";
import { Button } from "@merit/ui/button";
import { Notice } from "@merit/ui/notice";
import { Select } from "@merit/ui/select";

import {
  reconcilePreparation,
  type PreparationDraft,
  type PreparationField,
} from "../../controllers/preparation/preparation-state";
import styles from "./preparation.module.css";

export const LatestPreparation = ({
  draft,
  round,
  revision,
  managers,
  onReconcile,
}: {
  draft: PreparationDraft;
  round: RoundView;
  revision: number;
  managers: readonly { userId: string; name: string | null; email: string | null }[];
  onReconcile: (draft: PreparationDraft) => void;
}) => {
  const { t } = useTranslation("roundPreparation");
  const { money, calendarDate } = useFormat();
  const [choices, setChoices] = useState<Partial<Record<PreparationField, "mine" | "saved">>>({});
  const result = reconcilePreparation(draft, round, revision, choices);
  const labels: Record<PreparationField, string> = {
    title: t("preparation.name"),
    purpose: t("round.purpose"),
    meetingDate: t("round.committeeDate"),
    criteria: t("round.criteria"),
    amount: t("preparation.amount"),
    userId: t("preparation.responsibleManager"),
  };

  const value = (draft: PreparationDraft, field: PreparationField): ReactNode => {
    const source = { ...draft.baseline, ...draft.value };
    if (field === "criteria") {
      return source.criteria.length ? (
        <ol>
          {source.criteria.map((criterion) => (
            <li key={criterion.key}>
              {criterion.title}
              <p>{criterion.description}</p>
            </li>
          ))}
        </ol>
      ) : (
        t("round.noCriteria")
      );
    }
    if (field === "amount") {
      const amount = parseMoneyInput(source.amount);
      return amount ? money(amount) : source.amount || t("preparation.notSet");
    }
    if (field === "meetingDate") {
      return source.meetingDate ? calendarDate(source.meetingDate) : t("preparation.notScheduled");
    }
    if (field === "userId") {
      const manager = managers.find((person) => person.userId === source.userId);
      return (
        manager?.name ??
        manager?.email ??
        (draft === result.latest ? round.manager : t("preparation.unknownPerson"))
      );
    }

    return source[field] || t("preparation.notSet");
  };

  return (
    <Notice as="div" tone="warning" role="alert">
      <p>{t(result.conflicts.length ? "preparation.resolveConflicts" : "preparation.mergeSafe")}</p>
      {result.conflicts.map((field) => (
        <div className={styles.latest} key={field}>
          <h2>{labels[field]}</h2>
          <strong>{t("preparation.yourDraft")}</strong>
          <div>{value(draft, field)}</div>
          <strong>{t("preparation.latestSaved")}</strong>
          <div>{value(result.latest, field)}</div>
          <Select
            label={t("preparation.chooseVersion", { field: labels[field] })}
            placeholder={t("preparation.chooseVersionPlaceholder")}
            selectedKey={choices[field] ?? null}
            items={[
              { id: "mine" as const, label: t("preparation.keepMine") },
              { id: "saved" as const, label: t("preparation.useSaved") },
            ]}
            onSelectionChange={(choice) =>
              setChoices((current) => ({ ...current, [field]: choice }))
            }
          />
        </div>
      ))}
      <Button
        variant="secondary"
        size="small"
        isDisabled={!result.resolved}
        onPress={() => onReconcile(result.merged)}
      >
        {t("preparation.reconcile")}
      </Button>
    </Notice>
  );
};
