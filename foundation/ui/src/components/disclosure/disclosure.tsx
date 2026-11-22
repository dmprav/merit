import type { ReactNode } from "react";
import {
  Button,
  Disclosure as AriaDisclosure,
  DisclosurePanel,
  Heading,
} from "react-aria-components/Disclosure";

import { IconBase } from "../icon/icon-base";
import styles from "./disclosure.module.css";

/**
 * Supporting material people inspect occasionally, such as earlier versions, under a quiet
 * heading with a turning chevron and an optional count. Keep what a decision needs visible
 * instead; a disclosure is for material that would otherwise crowd the task.
 */
export const Disclosure = ({
  title,
  count,
  headingLevel = 3,
  defaultExpanded = false,
  isExpanded,
  onExpandedChange,
  children,
}: {
  title: string;
  /** How many entries the panel holds, shown beside the title. */
  count?: number;
  headingLevel?: 2 | 3 | 4;
  defaultExpanded?: boolean;
  /** The caller owns the open state, such as a log entry that folds when its work is done. */
  isExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  children: ReactNode;
}) => (
  <AriaDisclosure
    className={styles.disclosure}
    defaultExpanded={defaultExpanded}
    isExpanded={isExpanded}
    onExpandedChange={onExpandedChange}
  >
    <Heading level={headingLevel} className={styles.heading}>
      <Button slot="trigger" className={styles.trigger}>
        <IconBase name="right" className={styles.chevron} />
        <span>{title}</span>
        {/* The space keeps the title and count separate words in the accessible name. */}
        {count !== undefined && <span className={styles.count}> {count}</span>}
      </Button>
    </Heading>
    <DisclosurePanel className={styles.panel}>{children}</DisclosurePanel>
  </AriaDisclosure>
);
