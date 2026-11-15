import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { useCloseNavigation } from "@merit/ui/application-shell";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Tooltip } from "@merit/ui/tooltip";

import styles from "./navigation.module.css";
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

  const shortcut = platform === "unknown" ? "" : platform === "apple" ? "⌘ K" : "Ctrl K";

  return (
    <Tooltip
      content={`${t("navigation.search")}${shortcut ? ` (${shortcut})` : ""}`}
      placement="right"
    >
      <Button
        variant="quiet"
        className={`${shellStyles.navigationItem} ${styles.searchButton}`}
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
            button?.setAttribute(
              "aria-keyshortcuts",
              platform === "apple" ? "Meta+K" : "Control+K",
            );
          }
        }}
      >
        <Icon name="search" />
        <span className={styles.searchLabel}>{t("navigation.search")}</span>
        {shortcut && (
          <kbd className={styles.shortcut} aria-hidden="true">
            {shortcut}
          </kbd>
        )}
      </Button>
    </Tooltip>
  );
};
