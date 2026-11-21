import type { ReactNode } from "react";

import { ButtonBase, type ButtonBaseProps } from "../../components/button/button-base";
import { IconBase } from "../../components/icon/icon-base";
import styles from "./property-button.module.css";

/** An editable value with a visible cue; the feature owns its editor and commitment. */
export const PropertyButton = ({
  action,
  label,
  draftLabel,
  children,
  ...props
}: Pick<
  ButtonBaseProps,
  "ref" | "id" | "onPress" | "isDisabled" | "autoFocus" | "aria-describedby" | "aria-expanded"
> & {
  action: "edit" | "choose";
  label: string;
  draftLabel?: string;
  children: ReactNode;
}) => (
  <ButtonBase
    {...props}
    size="small"
    variant="quiet"
    className={styles.property}
    aria-label={draftLabel ? `${label} ${draftLabel}` : label}
  >
    <span className={styles.value}>{children}</span>
    <IconBase name={action === "choose" ? "down" : "edit"} className={styles.cue} />
    {draftLabel && <span className={styles.draft}> {draftLabel}</span>}
  </ButtonBase>
);
