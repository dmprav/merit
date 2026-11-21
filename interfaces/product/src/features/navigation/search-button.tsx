import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { ApplicationNavigationButton, useCloseNavigation } from "@merit/ui/application-shell";

import { useShortcutPlatform } from "./search-shortcut";

/** Opens workspace search, showing the shortcut that does the same from anywhere. */
export const SearchButton = ({
  onPress,
  buttonRef,
}: {
  onPress: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) => {
  const { t } = useTranslation("web");
  const platform = useShortcutPlatform();
  const closeNavigation = useCloseNavigation();

  const shortcut = platform === "unknown" ? undefined : platform === "apple" ? "⌘ K" : "Ctrl K";

  return (
    <ApplicationNavigationButton
      icon="search"
      label={t("navigation.search")}
      shortcut={shortcut}
      onPress={() => {
        // The drawer closes before the search box opens over the page.
        closeNavigation();
        onPress();
      }}
      // React Aria drops this attribute from its buttons, so it is set on the element itself.
      ref={(button) => {
        if (buttonRef) {
          buttonRef.current = button;
        }
        if (platform === "unknown") {
          button?.removeAttribute("aria-keyshortcuts");
        } else {
          button?.setAttribute("aria-keyshortcuts", platform === "apple" ? "Meta+K" : "Control+K");
        }
      }}
    />
  );
};
