import { IconBase, toneIcons, type IconName } from "../icon/icon-base";
import styles from "./badge.module.css";

/**
 * Badge presents a short, read-only status beside the item it describes; show a date, count, or
 * other metadata with MetaItem instead. Use neutral for routine states, success for confirmed
 * positive outcomes, warning for something needing attention, and danger for failure. Keep funding
 * judgments neutral: a recommendation to fund is not a successful system action. The visible label
 * carries the meaning without color. Use appearance=plain for a quiet status column: it adds the
 * tone's icon from the shared tone icons, or `icon` for a neutral status. Labels wrap when space
 * or enlarged text requires it. Use a button or link for an action, and Notice for an explanation
 * or recovery step.
 */
export const Badge = ({
  tone = "neutral",
  appearance = "badge",
  icon,
  children,
  lang,
}: {
  /** The status label. */
  children: string;
  /** The label's language when it differs from the surrounding text. */
  lang?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  appearance?: "badge" | "plain";
  /** A plain badge's icon, for a neutral status; other tones use their shared tone icon. */
  icon?: IconName;
}) => {
  const glyph =
    appearance === "plain"
      ? (icon ?? (tone === "neutral" ? undefined : toneIcons[tone]))
      : undefined;

  return (
    <span lang={lang} data-tone={tone} data-appearance={appearance} className={styles.badge}>
      {glyph && <IconBase name={glyph} />}
      {children}
    </span>
  );
};
