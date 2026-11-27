import { Toggletip } from "../../components/toggletip/toggletip";
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
}) => (
  <Toggletip label={label} tone={tone === "warning" ? "warning" : "info"}>
    {explanation}
  </Toggletip>
);

/**
 * Reserves an indicator's width where a value has none, so values in a column of figures line up
 * whether or not each one carries an indicator.
 */
export const StatusIndicatorSpace = () => <span aria-hidden="true" className={styles.space} />;
