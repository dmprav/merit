import { useLayoutEffect, useRef, useState } from "react";

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
}: {
  label: string;
  /** The button's accessible name, which says what removing the chip does. */
  removeLabel: string;
  icon?: IconName;
  /** Keep the chip to one line, with the full label in a tooltip on hover and focus when cut off. */
  truncate?: boolean;
  onRemove: () => void;
}) => {
  const text = useRef<HTMLSpanElement>(null);
  const [isCutOff, setIsCutOff] = useState(false);

  useLayoutEffect(() => {
    const node = text.current;
    if (!truncate || !node) {
      return;
    }

    const measure = () => setIsCutOff(node.scrollWidth > node.clientWidth);

    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [truncate, label]);

  const chip = (
    <ButtonBase
      variant="quiet"
      size="small"
      className={styles.chip}
      aria-label={removeLabel}
      data-chip=""
      data-truncate={truncate || undefined}
      onPress={onRemove}
    >
      {icon && <IconBase name={icon} />}
      <span ref={text}>{label}</span>
      <IconBase name="close" />
    </ButtonBase>
  );

  return truncate ? (
    <Tooltip content={label} isDisabled={!isCutOff}>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
};
