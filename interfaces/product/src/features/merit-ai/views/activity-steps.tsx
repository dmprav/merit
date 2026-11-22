import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { Disclosure } from "@merit/ui/disclosure";
import { Icon } from "@merit/ui/icon";

import type { StepContent } from "../contracts";
import styles from "./merit-ai.module.css";

const summarize = (steps: readonly StepContent[], language: string) => {
  const sentence = new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(
    steps.map((step) => step.summary),
  );
  return sentence.charAt(0).toLocaleUpperCase(language) + sentence.slice(1);
};

const StepIcon = ({ status, isLive }: { status: StepContent["status"]; isLive: boolean }) => {
  if (status === "done") {
    return <Icon name="check" />;
  }
  // A step still running when the run is no longer live was cut short.
  return isLive ? (
    <span className={styles.spinner}>
      <Icon name="loading" />
    </span>
  ) : (
    <Icon name="warning" />
  );
};

/**
 * What Merit AI is doing, one quiet line. It is open while the work runs, each step appearing as
 * it starts, and folds to a summary once the answer begins; the person can still open or close it.
 */
export const ActivitySteps = ({
  steps,
  isLive,
  isWorking,
}: {
  steps: readonly StepContent[];
  /** The run is still going. */
  isLive: boolean;
  /** The answer has not started: its steps are all there is to read yet. */
  isWorking: boolean;
}) => {
  const { t } = useTranslation("meritAi");
  const { language } = useLocaleSettings();
  const [chosen, setChosen] = useState<boolean>();

  return (
    <Disclosure
      title={isWorking ? t("activity.working") : summarize(steps, language)}
      isExpanded={chosen ?? isWorking}
      onExpandedChange={setChosen}
    >
      <ul className={styles.steps}>
        {steps.map((step) => (
          <li key={step.label} className={styles.step}>
            <StepIcon status={step.status} isLive={isLive} />
            <span>{step.label}</span>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
};
