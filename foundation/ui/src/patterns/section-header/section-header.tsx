import { createElement, type ReactNode, type Ref } from "react";

import { Inline } from "../../components/layout/layout";
import styles from "./section-header.module.css";

/**
 * A section's heading with an optional count and aside, such as the section's action. Like
 * PageHeader, it owns the space before the section's content. Levels 3 to 5 head nested
 * subsections, such as questions within a submission, keeping the document outline. quiet
 * suits the summary sections of a supporting pane, where the content matters more than the
 * headings. headingRef lets a feature return focus to the heading after navigation within the page.
 */
export const SectionHeader = ({
  title,
  id,
  count,
  aside,
  level = 2,
  emphasis = "default",
  headingRef,
}: {
  title: ReactNode;
  id?: string;
  count?: ReactNode;
  aside?: ReactNode;
  level?: 2 | 3 | 4 | 5;
  emphasis?: "default" | "quiet";
  headingRef?: Ref<HTMLHeadingElement>;
}) => (
  <div className={styles.header} data-emphasis={emphasis}>
    <Inline gap={3} justify="between">
      {createElement(
        `h${level}`,
        { id, ref: headingRef, tabIndex: headingRef ? -1 : undefined, className: styles.title },
        title,
        count != null && <span className={styles.count}> {count}</span>,
      )}
      {aside}
    </Inline>
  </div>
);
