import type { ReactNode, Ref } from "react";

import { ButtonBase } from "../../components/button/button-base";
import { IconBase, type IconName } from "../../components/icon/icon-base";
import { PersonIdentity } from "../person-identity/person-identity";
import styles from "./judgment.module.css";

type JudgmentContent = {
  /** The person, or other author, whose judgment this is. */
  author: string;
  /** A glyph in place of initials, when the author is not a person, such as Merit AI. */
  authorIcon?: IconName;
  /** Muted facts beside the author, such as when it was recorded. */
  meta?: ReactNode;
  /** The position and any amount, with the position in strong text. Omit before a judgment exists. */
  summary?: ReactNode;
  /** What the judgment was based on, as separate short spans. */
  basis?: ReactNode;
};

const JudgmentParts = ({
  as: Element,
  author,
  authorIcon,
  meta,
  summary,
  basis,
  aside,
  children,
}: JudgmentContent & { as: "div" | "span"; aside: ReactNode; children?: ReactNode }) => (
  <>
    <Element className={styles.header}>
      <span className={styles.identity}>
        <PersonIdentity name={author} icon={authorIcon} />
        {meta != null && <span className={styles.meta}>{meta}</span>}
      </span>
      {aside}
    </Element>
    {summary != null && (
      <Element className={styles.body}>
        <Element className={styles.summary}>{summary}</Element>
        {basis != null && <Element className={styles.basis}>{basis}</Element>}
        {children}
      </Element>
    )}
  </>
);

/**
 * A person's judgment: who made it and when, their position, and a basis only when it qualifies
 * the position, followed by supporting content such as their reasoning. action sits at the end of
 * the author line, such as an icon-only edit control.
 */
export const Judgment = ({
  action,
  children,
  ...content
}: JudgmentContent & { action?: ReactNode; children?: ReactNode }) => (
  <div className={styles.judgment}>
    <JudgmentParts as="div" aside={action} {...content}>
      {children}
    </JudgmentParts>
  </div>
);

/** A judgment summary that opens the full judgment. */
export const JudgmentChoice = ({
  onPress,
  ref,
  ...content
}: JudgmentContent & { onPress: () => void; ref?: Ref<HTMLButtonElement> }) => (
  <ButtonBase variant="quiet" className={styles.choice} ref={ref} onPress={onPress}>
    <JudgmentParts as="span" aside={<IconBase name="right" />} {...content} />
  </ButtonBase>
);
