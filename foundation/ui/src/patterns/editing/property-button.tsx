import type { ComponentProps, ReactNode } from "react";

import { Button } from "../../components/button/button";
import { Icon } from "../../components/icon/icon";
import styles from "./property-button.module.css";

/** An editable value with a visible cue; the feature owns its editor and commitment. */
export const PropertyButton = ({
  action,
  label,
  draftLabel,
  children,
  ...props
}: Omit<
  ComponentProps<typeof Button>,
  "variant" | "size" | "iconOnly" | "className" | "style" | "children" | "aria-label"
> & {
  action: "edit" | "choose";
  label: string;
  draftLabel?: string;
  children: ReactNode;
}) => (
  <Button
    {...props}
    size="small"
    variant="quiet"
    className={styles.property}
    aria-label={draftLabel ? `${label} ${draftLabel}` : label}
  >
    <span className={styles.value}>{children}</span>
    <Icon name={action === "choose" ? "down" : "edit"} className={styles.cue} />
    {draftLabel && <span className={styles.draft}> {draftLabel}</span>}
  </Button>
);
