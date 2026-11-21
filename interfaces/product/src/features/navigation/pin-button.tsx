import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";

import { sameNavigationTarget, type NavigationTarget } from "@merit/grantmaking/api";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Inline } from "@merit/ui/layout";
import { Tooltip } from "@merit/ui/tooltip";

import { NavigationPinsContext } from "./context";
import styles from "./navigation.module.css";

export const PinButton = ({ target, title }: { target: NavigationTarget; title: string }) => {
  const { t } = useTranslation("web");
  const state = useContext(NavigationPinsContext);
  const [error, setError] = useState(false);
  if (!state) {
    return null;
  }
  const pinned = state.pins.some((pin) => sameNavigationTarget(pin.target, target));
  return (
    <div className={styles.pinButton}>
      <Inline gap={2}>
        <Tooltip content={t(pinned ? "pins.unpin" : "pins.pin")} placement="bottom">
          <Button
            variant="quiet"
            iconOnly
            aria-label={t("pins.pinName", { title })}
            aria-pressed={pinned}
            isDisabled={state.loading || state.unavailable || state.busy}
            onPress={async () => {
              setError(false);
              setError(!(await state.change({ action: pinned ? "unpin" : "pin", target })));
            }}
          >
            <Icon name={pinned ? "pinned" : "pin"} />
          </Button>
        </Tooltip>
        {error && <span role="alert">{t("pins.saveError")}</span>}
      </Inline>
    </div>
  );
};
