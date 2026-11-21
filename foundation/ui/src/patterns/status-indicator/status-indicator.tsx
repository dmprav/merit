import { useState } from "react";

import { ButtonBase } from "../../components/button/button-base";
import { PickerPopover } from "../../components/dialog/dialog";
import { IconBase } from "../../components/icon/icon-base";
import { Tooltip } from "../../components/tooltip/tooltip";
import styles from "./status-indicator.module.css";

/** A brief status qualification available on hover, keyboard focus, and tap. */
export const StatusIndicator = ({
  label,
  explanation,
  tone = "warning",
}: {
  label: string;
  explanation: string;
  tone?: "warning" | "muted";
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <PickerPopover
      title={label}
      placement="bottom start"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <Tooltip content={explanation} isDisabled={isOpen}>
          <ButtonBase
            variant="quiet"
            size="small"
            iconOnly
            className={styles.indicator}
            data-tone={tone}
            aria-label={label}
          >
            <IconBase name={tone === "warning" ? "warning" : "info"} />
          </ButtonBase>
        </Tooltip>
      }
    >
      <div className={styles.content}>
        <p>{explanation}</p>
      </div>
    </PickerPopover>
  );
};

/**
 * Reserves an indicator's width where a value has none, so values in a column of figures line up
 * whether or not each one carries an indicator.
 */
export const StatusIndicatorSpace = () => <span aria-hidden="true" className={styles.space} />;
