import { useState } from "react";

import { Button } from "../../components/button/button";
import { PopoverDialog } from "../../components/dialog/dialog";
import { Icon } from "../../components/icon/icon";
import { Tooltip } from "../../components/tooltip/tooltip";
import styles from "./status-indicator.module.css";

/** A brief status qualification available on hover, keyboard focus, and tap. */
export const StatusIndicator = ({
  label,
  explanation,
  closeLabel,
  tone = "warning",
}: {
  label: string;
  explanation: string;
  closeLabel: string;
  tone?: "warning" | "muted";
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <PopoverDialog
      title={label}
      closeLabel={closeLabel}
      appearance="compact"
      placement="bottom start"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <Tooltip content={explanation} isDisabled={isOpen}>
          <Button
            variant="quiet"
            size="small"
            iconOnly
            className={styles.indicator}
            data-tone={tone}
            aria-label={label}
          >
            <Icon name={tone === "warning" ? "warning" : "info"} />
          </Button>
        </Tooltip>
      }
    >
      {({ closeButton }) => (
        <div className={styles.content}>
          <p>{explanation}</p>
          {closeButton}
        </div>
      )}
    </PopoverDialog>
  );
};
