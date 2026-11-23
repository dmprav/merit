import { useId, type ReactNode, type Ref } from "react";

import { SectionHeader } from "../section-header/section-header";
import styles from "./panel-section.module.css";

/**
 * The sections of a supporting side panel, such as the summaries beside a record's main work.
 * PanelSections owns the equal space between them; each PanelSection has a quiet header row with
 * its label, an optional count, and quiet actions at the end, then an optional supporting line and
 * its content, flush with the label.
 */
export const PanelSections = ({ children }: { children: ReactNode }) => (
  <div className={styles.sections}>{children}</div>
);

export const PanelSection = ({
  title,
  count,
  actions,
  meta,
  headingRef,
  children,
}: {
  title: ReactNode;
  count?: ReactNode;
  /** Quiet or secondary buttons, such as an edit or add trigger and a link to the full list. */
  actions?: ReactNode;
  /** One supporting line under the header, such as a status summary of the content. */
  meta?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}) => {
  const id = useId();
  return (
    <section className={styles.section} aria-labelledby={id}>
      <SectionHeader
        id={id}
        title={title}
        count={count}
        emphasis="quiet"
        meta={meta}
        headingRef={headingRef}
        aside={actions == null ? undefined : <div className={styles.actions}>{actions}</div>}
      />
      {children}
    </section>
  );
};
