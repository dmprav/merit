import { useTranslation } from "react-i18next";

import type { DecisionVersion } from "@merit/decisions/domain";
import { useFormat } from "@merit/i18n/format";
import { isZero } from "@merit/money";
import { ActionProvenance } from "@merit/ui/action-provenance";
import { Disclosure } from "@merit/ui/disclosure";
import { Inline, Reading, Stack } from "@merit/ui/layout";
import { OutcomeSummary } from "@merit/ui/outcome-summary";
import { Text } from "@merit/ui/text";
import { Timeline, TimelineEntry } from "@merit/ui/timeline";
import { Timestamp } from "@merit/ui/timestamp";

import styles from "./decision.module.css";
import { decisionOutcomeKeys } from "./messages";

const DecisionFacts = ({ version }: { version: DecisionVersion }) => {
  const { t } = useTranslation("committeeDecisions");
  const { money, calendarDate } = useFormat();
  const { decision } = version;

  return (
    <>
      <OutcomeSummary
        title={t(decisionOutcomeKeys[decision.outcome], { context: "summary" })}
        detail={
          isZero(decision.amount)
            ? t("section.noAmount")
            : t("section.amount", { amount: money(decision.amount) })
        }
      />
      {decision.conditions && (
        <div className={styles.fact}>
          <Text as="p" variant="caption">
            {t("section.conditions")}
          </Text>
          <Reading prose={false} as="p">
            {decision.conditions}
          </Reading>
        </div>
      )}
      <div className={styles.fact}>
        <Text as="p" variant="caption">
          {t("section.reason")}
        </Text>
        <Reading prose={false} as="p">
          {decision.reason}
        </Reading>
      </div>
      <div className={styles.decided}>
        <Text as="p" variant="supporting">
          {t("section.decidedBy", {
            body: decision.decidedBy,
            date: calendarDate(decision.decisionDate),
          })}
        </Text>
      </div>
    </>
  );
};

/** Who recorded the version, through which interface, and when: kept apart from the deciding body. */
const DecisionRecorder = ({ version }: { version: DecisionVersion }) => {
  const { t } = useTranslation("common");
  const { recorder, recordedAt } = version.decision;
  return (
    <Text as="div" variant="caption">
      <Inline align="baseline" gap={3}>
        <span>{t("recordedBy", { name: recorder.name || t("unknownActor") })}</span>
        <ActionProvenance value={recorder.provenance ?? null} detail />
        <Timestamp value={recordedAt} />
      </Inline>
    </Text>
  );
};

/** The saved versions, newest first, each with its fields, explanation, and recorder. */
const DecisionHistory = ({ versions }: { versions: readonly DecisionVersion[] }) => {
  const { t } = useTranslation("committeeDecisions");
  return (
    <Timeline label={t("section.history")}>
      {versions.map((version) => (
        <TimelineEntry
          key={version.revision}
          title={t("section.version", { revision: version.revision })}
          attribution={<DecisionRecorder version={version} />}
        >
          <div className={styles.version}>
            <DecisionFacts version={version} />
            {version.decision.changeExplanation && (
              <div>
                <Text as="p" variant="caption">
                  {t("section.changeExplanation")}
                </Text>
                <Reading prose={false} as="p">
                  {version.decision.changeExplanation}
                </Reading>
              </div>
            )}
          </div>
        </TimelineEntry>
      ))}
    </Timeline>
  );
};

/** The current decision, who recorded it, and the earlier versions behind it. */
export const DecisionSummary = ({ versions }: { versions: readonly DecisionVersion[] }) => {
  const { t } = useTranslation("committeeDecisions");
  const [current] = versions;
  if (!current) {
    return (
      <Text as="p" variant="missing">
        {t("section.none")}
      </Text>
    );
  }

  return (
    <Stack gap={2}>
      <DecisionFacts version={current} />
      <DecisionRecorder version={current} />
      {versions.length > 1 && (
        <div className={styles.history}>
          <Disclosure title={t("section.history")} count={versions.length}>
            <DecisionHistory versions={versions} />
          </Disclosure>
        </div>
      )}
    </Stack>
  );
};
