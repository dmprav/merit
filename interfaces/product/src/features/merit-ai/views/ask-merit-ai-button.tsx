import { useTranslation } from "react-i18next";

import { ApplicationNavigationButton, useCloseNavigation } from "@merit/ui/application-shell";

import { shortcutHint, shortcutKeys, useShortcutPlatform } from "../../navigation/search-shortcut";

/** Opens Merit AI beside the page, showing the shortcut that does the same from anywhere. */
export const AskMeritAiButton = ({ onPress }: { onPress: () => void }) => {
  const { t } = useTranslation("meritAi");
  const platform = useShortcutPlatform();
  const closeNavigation = useCloseNavigation();

  return (
    <ApplicationNavigationButton
      icon="assistant"
      label={t("open")}
      shortcut={shortcutHint(platform, "j")}
      onPress={() => {
        // The drawer closes before the panel opens over the page.
        closeNavigation();
        onPress();
      }}
      // React Aria drops this attribute from its buttons, so it is set on the element itself.
      ref={(button) => {
        const keys = shortcutKeys(platform, "j");
        if (keys) {
          button?.setAttribute("aria-keyshortcuts", keys);
        } else {
          button?.removeAttribute("aria-keyshortcuts");
        }
      }}
    />
  );
};
