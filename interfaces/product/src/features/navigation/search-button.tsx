import { useTranslation } from "react-i18next";

import { useCloseNavigation } from "@merit/ui/application-shell";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";

import styles from "./navigation.module.css";
import { useShortcutPlatform } from "./search-shortcut";

/** Opens workspace search, showing the shortcut that does the same from anywhere. */
export const SearchButton = ({ onPress }: { onPress: () => void }) => {
  const { t } = useTranslation("web");
  const platform = useShortcutPlatform();
  const closeNavigation = useCloseNavigation();

  return (
    <Button
      variant="quiet"
      className={shellStyles.navigationItem}
      onPress={() => {
        // The drawer closes before the search box opens over the page.
        closeNavigation();
        onPress();
      }}
      // React Aria drops this attribute from its buttons, so it is set on the element itself.
      ref={(button) => {
        button?.setAttribute("aria-keyshortcuts", platform === "apple" ? "Meta+K" : "Control+K");
      }}
    >
      <Icon name="search" />
      <span className={styles.searchLabel}>{t("navigation.search")}</span>
      <kbd className={styles.shortcut} aria-hidden="true">
        {platform === "apple" ? "⌘K" : "Ctrl K"}
      </kbd>
    </Button>
  );
};
