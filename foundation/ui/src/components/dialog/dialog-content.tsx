import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type ReactNode,
} from "react";

import scrollStyles from "../../foundations/scroll-area.module.css";
import styles from "./dialog-content.module.css";

const unframed = { framed: false };
/** Framed dialogs give their content gutters and a tinted footer; nested content starts unframed. */
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

const useDialogOverflow = ({
  children,
  feedback,
  footer,
}: Pick<DialogContentProps, "children" | "feedback" | "footer">) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const dialog = content?.closest<HTMLElement>("[data-modal-dialog]");
    const header = dialog?.querySelector<HTMLElement>(":scope > [data-dialog-header]");
    const body = content?.querySelector<HTMLElement>(":scope > [data-dialog-body]");
    if (
      !content ||
      !dialog ||
      !header ||
      !body ||
      dialog.querySelector("[data-dialog-content]") !== content ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }
    const actions = content.querySelector<HTMLElement>(":scope > [data-dialog-footer]");
    const feedbackArea = content.querySelector<HTMLElement>(":scope > [data-dialog-feedback]");

    const measure = () => {
      const frameStyle = getComputedStyle(dialog);
      const headerStyle = getComputedStyle(header);
      const available =
        Number.parseFloat(frameStyle.maxHeight) -
        Number.parseFloat(frameStyle.paddingTop) -
        Number.parseFloat(frameStyle.paddingBottom);
      const readingSpace = Math.min(
        body.scrollHeight,
        4 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      );
      const required =
        header.offsetHeight +
        Number.parseFloat(headerStyle.marginTop) +
        Number.parseFloat(headerStyle.marginBottom) +
        (actions?.offsetHeight ?? 0) +
        (feedbackArea?.offsetHeight ?? 0) +
        readingSpace;
      // Let the whole task scroll when a persistent heading and actions would crowd out its fields.
      const scrollContent = required > available;
      if (dialog.hasAttribute("data-scroll-content") !== scrollContent) {
        dialog.toggleAttribute("data-scroll-content", scrollContent);
        if (!scrollContent) {
          dialog.scrollTop = 0;
        }
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && dialog.contains(focused)) {
          focused.scrollIntoView({ block: "nearest" });
        }
      }
    };

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    for (const element of [dialog, header, body, body.firstElementChild, feedbackArea, actions]) {
      if (element) {
        observer.observe(element);
      }
    }
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [children, feedback, footer]);

  return contentRef;
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
  const contentRef = useDialogOverflow({ children, feedback, footer });

  return (
    <div
      ref={contentRef}
      className={styles.content}
      data-framed={frame.framed || undefined}
      data-dialog-content
      onFocus={revealFocusedControl}
    >
      <DialogFrameContext value={unframed}>
        <div
          className={`${styles.body}`}
          data-dialog-body
          data-reading={reading || undefined}
          tabIndex={0}
          role={role}
          aria-label={label ?? frame.title}
        >
          {children}
        </div>
        {feedback && (
          <div className={styles.feedback} data-dialog-feedback>
            {feedback}
          </div>
        )}
        {footer && (
          <div
            className={`${styles.footer} ${frame.framed ? scrollStyles.dividerUntilEnd : ""}`}
            data-dialog-footer
          >
            {footer}
          </div>
        )}
      </DialogFrameContext>
    </div>
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
