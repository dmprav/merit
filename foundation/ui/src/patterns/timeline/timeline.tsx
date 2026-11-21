import { createElement, type ReactNode, type Ref } from "react";

import styles from "./timeline.module.css";

/** Recorded events in order, each beside a shared rail. Order the entries before rendering. */
export const Timeline = ({ label, children }: { label?: string; children: ReactNode }) => (
  <ol aria-label={label} className={styles.timeline}>
    {children}
  </ol>
);

/**
 * One recorded event: its title, an Attribution, and any reason or change that follows. titleRef
 * lets a feature return focus to the entry after navigation within the page.
 */
export const TimelineEntry = ({
  title,
  attribution,
  headingLevel = 3,
  titleRef,
  children,
}: {
  title: ReactNode;
  attribution?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  titleRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}) => (
  <li className={styles.entry}>
    <div className={styles.heading}>
      {createElement(
        `h${headingLevel}`,
        { ref: titleRef, tabIndex: titleRef ? -1 : undefined, className: styles.title },
        title,
      )}
      {attribution}
    </div>
    {children}
  </li>
);
