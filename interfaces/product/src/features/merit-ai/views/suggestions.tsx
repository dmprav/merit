import { useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import { Stack } from "@merit/ui/layout";

import type { ScriptId } from "../contracts";

/** Questions Merit AI can answer with a recorded example; choosing one asks it as written. */
export const Suggestions = ({
  scripts,
  onChoose,
}: {
  scripts: readonly ScriptId[];
  onChoose: (question: string) => void;
}) => {
  const { t } = useTranslation("meritAi");

  return (
    <Stack as="ul" gap={2} aria-label={t("suggestions.label")}>
      {scripts.map((script) => (
        <li key={script}>
          <Button
            variant="secondary"
            alignment="fill"
            onPress={() => onChoose(t(`suggestions.${script}`))}
          >
            {t(`suggestions.${script}`)}
          </Button>
        </li>
      ))}
    </Stack>
  );
};
