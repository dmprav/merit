import { createElement, type ReactNode, type Ref } from "react";

import { Count } from "../../components/count/count";
import { Inline } from "../../components/layout/layout";
import styles from "./section-header.module.css";

/**
 * A section's heading with an optional count and aside, such as the section's action. Like
 * PageHeader, it owns the space before the section's content, and its actions are secondary or
 * quiet: filled buttons commit work in the content below. Levels 3 to 5 head nested
 * subsections, such as questions within a submission, keeping the document outline; each level
 * steps down in size, so use the next level rather than skipping one for its look. quiet
 * suits the summary sections of a supporting pane, where the content matters more than the
 * headings, and keeps its row one control tall so headings line up whether or not they carry an
 * action. meta is one supporting line directly under the heading, such as a status summary of the
 * content below. headingRef lets a feature return focus to the heading after navigation within the
 * page.
 */
export const SectionHeader = ({
  title,
  id,
  count,
  aside,
  meta,
  level = 2,
  emphasis = "default",
  headingRef,
}: {
  title: ReactNode;
  id?: string;
  count?: ReactNode;
  aside?: ReactNode;
  meta?: ReactNode;
  level?: 2 | 3 | 4 | 5;
  emphasis?: "default" | "quiet";
  headingRef?: Ref<HTMLHeadingElement>;
}) => (
  <div className={styles.header} data-emphasis={emphasis} data-level={level}>
    <Inline gap={3} justify="between">
      {createElement(
        `h${level}`,
        { id, ref: headingRef, tabIndex: headingRef ? -1 : undefined, className: styles.title },
        title,
        count != null && (
          <>
            {" "}
            <Count>{count}</Count>
          </>
        ),
      )}
      {aside != null && (
        <div className={styles.aside} data-header-actions>
          {aside}
        </div>
      )}
    </Inline>
    {meta != null && <div className={styles.meta}>{meta}</div>}
  </div>
);
