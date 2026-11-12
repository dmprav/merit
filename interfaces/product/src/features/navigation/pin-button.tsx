import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";

import { sameNavigationTarget, type NavigationTarget } from "@merit/grantmaking/api";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Inline } from "@merit/ui/layout";

import { NavigationPinsContext } from "./context";

export const PinButton = ({ target, title }: { target: NavigationTarget; title: string }) => {
  const { t } = useTranslation("web");
  const state = useContext(NavigationPinsContext);
  const [error, setError] = useState(false);
  if (!state) {
    return null;
  }
  const pinned = state.pins.some((pin) => sameNavigationTarget(pin.target, target));
  return (
    <Inline gap={2}>
      <Button
        variant="quiet"
        size="small"
        aria-label={t(pinned ? "pins.unpinName" : "pins.pinName", { title })}
        aria-pressed={pinned}
        isDisabled={state.loading || state.unavailable || state.busy}
        onPress={async () => {
          setError(false);
          setError(!(await state.change({ action: pinned ? "unpin" : "pin", target })));
        }}
      >
        <Icon name="pin" />
        {t(pinned ? "pins.pinned" : "pins.pin")}
      </Button>
      {error && <span role="alert">{t("pins.saveError")}</span>}
    </Inline>
  );
};
