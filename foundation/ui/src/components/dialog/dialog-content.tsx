import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from "react";

import styles from "./dialog-content.module.css";

export const DialogLayoutContext = createContext<"default" | "form">("default");

/**
 * A named, keyboard-scrollable body with optional persistent feedback and actions.
 * Works directly inside ModalDialog or inside a bounded form; PopoverDialog supplies
 * its own body. Nested content starts with the default layout.
 */
type DialogContentProps = {
  label: string;
  children: ReactNode;
  footer?: ReactNode;
  reading?: boolean;
  role?: "region" | "group";
};

export const DialogContent = ({
  label,
  children,
  footer,
  reading = false,
  role = "region",
}: DialogContentProps) => {
  const appearance = useContext(DialogLayoutContext);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const dialog = content?.closest<HTMLElement>('[data-modal-dialog="center"]');
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
    for (const element of [dialog, header, body, body.firstElementChild, actions]) {
      if (element) {
        observer.observe(element);
      }
    }
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [children, footer]);

  return (
    <div
      ref={contentRef}
      className={styles.content}
      data-appearance={appearance}
      data-dialog-content
    >
      <DialogLayoutContext value="default">
        <div
          className={styles.body}
          data-dialog-body
          data-reading={reading || undefined}
          tabIndex={0}
          role={role}
          aria-label={label}
        >
          {children}
        </div>
        {footer && (
          <div className={styles.footer} data-dialog-footer>
            {footer}
          </div>
        )}
      </DialogLayoutContext>
    </div>
  );
};
