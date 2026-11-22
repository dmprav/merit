import type { Ref } from "react";

import { ButtonBase } from "../button/button-base";
import { IconBase, type IconName } from "../icon/icon-base";
import { Tooltip } from "../tooltip/tooltip";
import styles from "./chip-base.module.css";

/**
 * A removable criterion or attachment shown as a quiet pill: pressing it removes it. For modules
 * inside this package; the caller owns where focus goes afterwards.
 */
export const ChipBase = ({
  label,
  removeLabel,
  icon,
  truncate = false,
  onRemove,
  ref,
}: {
  label: string;
  /** The button's accessible name, which says what removing the chip does. */
  removeLabel: string;
  icon?: IconName;
  /** Keep the chip to one line, with the full label in a tooltip on hover and focus. */
  truncate?: boolean;
  onRemove: () => void;
  ref?: Ref<HTMLButtonElement>;
}) => {
  const chip = (
    <ButtonBase
      ref={ref}
      variant="quiet"
      size="small"
      className={styles.chip}
      aria-label={removeLabel}
      data-chip=""
      data-truncate={truncate || undefined}
      onPress={onRemove}
    >
      {icon && <IconBase name={icon} />}
      <span>{label}</span>
      <IconBase name="close" />
    </ButtonBase>
  );

  return truncate ? <Tooltip content={label}>{chip}</Tooltip> : chip;
};
