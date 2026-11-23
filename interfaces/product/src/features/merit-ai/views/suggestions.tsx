import { useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";

import type { ScriptId } from "../contracts";
import styles from "./merit-ai.module.css";

/**
 * Questions Merit AI can answer with a recorded example, as quiet rows; choosing one asks it as
 * written.
 */
export const Suggestions = ({
  scripts,
  onChoose,
}: {
  scripts: readonly ScriptId[];
  onChoose: (question: string) => void;
}) => {
  const { t } = useTranslation("meritAi");

  return (
    <ul className={styles.suggestions} aria-label={t("suggestions.label")}>
      {scripts.map((script) => (
        <li key={script}>
          <Button
            variant="quiet"
            alignment="fill"
            onPress={() => onChoose(t(`suggestions.${script}`))}
          >
            <Icon name="forward" />
            {t(`suggestions.${script}`)}
          </Button>
        </li>
      ))}
    </ul>
  );
};
