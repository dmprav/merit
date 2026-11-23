import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import { Disclosure } from "@merit/ui/disclosure";
import { Icon, LoadingIcon } from "@merit/ui/icon";
import { VisuallyHidden } from "@merit/ui/visually-hidden";

import type { StepContent } from "../contracts";
import styles from "./merit-ai.module.css";

const summarize = (steps: readonly StepContent[], language: string) => {
  const sentence = new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(
    steps.map((step) => step.summary),
  );
  return sentence.charAt(0).toLocaleUpperCase(language) + sentence.slice(1);
};

/** A step still running when the run is no longer live was cut short. */
const stateOf = (status: StepContent["status"], isLive: boolean) =>
  status === "done" ? "done" : isLive ? "running" : "cutShort";

const StepIcon = ({ state }: { state: ReturnType<typeof stateOf> }) => {
  if (state === "done") {
    return <Icon name="check" />;
  }
  return state === "running" ? <LoadingIcon /> : <Icon name="warning" />;
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
  // Only finished work is summarized; a step cut short is not something Merit AI did.
  const finished = steps.filter((step) => step.status === "done");
  const summary = finished.length > 0 ? summarize(finished, language) : t("activity.stopped");

  return (
    <Disclosure
      title={isWorking ? t("activity.working") : summary}
      isExpanded={chosen ?? isWorking}
      onExpandedChange={setChosen}
    >
      <ul className={styles.steps}>
        {steps.map((step) => {
          const state = stateOf(step.status, isLive);
          return (
            <li key={step.label} className={styles.step}>
              <StepIcon state={state} />
              <span>
                {step.label}
                <VisuallyHidden> ({t(`activity.step.${state}`)})</VisuallyHidden>
              </span>
            </li>
          );
        })}
      </ul>
    </Disclosure>
  );
};
