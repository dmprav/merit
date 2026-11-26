import { createContext, useContext, type FocusEvent, type ReactNode } from "react";

import styles from "./dialog-content.module.css";
import { FrameBody, FrameContent, FrameFooter } from "./frame";

const unframed = { framed: false };
/** Framed surfaces give their content the frame's gutters; nested content starts unframed. */
export const DialogFrameContext = createContext<{ framed: boolean; title?: string }>(unframed);

/**
 * A named, keyboard-scrollable body with optional persistent feedback and actions.
 * Works directly inside ModalDialog or SidePanel, or inside a bounded form; PopoverDialog
 * supplies its own body.
 */
type DialogContentProps = {
  /** Names the scrolling region; defaults to the enclosing dialog's title. */
  label?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Persistent outcome feedback above the action footer, outside the scrolling body. */
  feedback?: ReactNode;
  reading?: boolean;
  role?: "region" | "group";
};

/**
 * Reveals a focused control fully, including its scroll padding. WebKit's own focus
 * scrolling ignores scroll padding and can align only a field's text area with the
 * scrolling edge, which leaves the field's border clipped.
 */
const revealFocusedControl = (event: FocusEvent<HTMLDivElement>) => {
  const content = event.currentTarget;
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    content.contains(target) &&
    !target.hasAttribute("data-dialog-body")
  ) {
    target.scrollIntoView({ block: "nearest" });
  }
};

export const DialogContent = ({
  label,
  children,
  footer,
  feedback,
  reading = false,
  role = "region",
}: DialogContentProps) => {
  const frame = useContext(DialogFrameContext);

  return (
    <FrameContent framed={frame.framed} data-dialog-content onFocus={revealFocusedControl}>
      <DialogFrameContext value={unframed}>
        <FrameBody
          framed={frame.framed}
          reading={reading}
          data-dialog-body
          tabIndex={0}
          role={role}
          aria-label={label ?? frame.title}
        >
          {children}
        </FrameBody>
        <FrameFooter framed={frame.framed} feedback={feedback}>
          {footer}
        </FrameFooter>
      </DialogFrameContext>
    </FrameContent>
  );
};

/**
 * A titled group inside dialog content. Its heading matches the size of the text it
 * introduces and is set apart by weight and space; consecutive sections share one rhythm.
 * The section stays unnamed so headings give structure without a landmark per group.
 */
export const DialogSection = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>{title}</h3>
    {children}
  </section>
);
