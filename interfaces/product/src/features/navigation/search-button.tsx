import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { ApplicationNavigationButton, useCloseNavigation } from "@merit/ui/application-shell";

import { shortcutHint, shortcutKeys, useShortcutPlatform } from "./search-shortcut";

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

  return (
    <ApplicationNavigationButton
      icon="search"
      label={t("navigation.search")}
      shortcut={shortcutHint(platform, "k")}
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
        const keys = shortcutKeys(platform, "k");
        if (keys) {
          button?.setAttribute("aria-keyshortcuts", keys);
        } else {
          button?.removeAttribute("aria-keyshortcuts");
        }
      }}
    />
  );
};
