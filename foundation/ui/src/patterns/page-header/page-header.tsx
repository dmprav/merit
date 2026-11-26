import { useLayoutEffect, useRef, type ReactNode } from "react";

import styles from "./page-header.module.css";

/**
 * The page's title, context, and its one main action, as a secondary or quiet button: the header
 * orients, and filled buttons commit work in the page or its dialogs. Put further commands in an
 * icon-only "More actions" menu beside it; Storybook rejects a second labelled action or a filled one.
 */
export const PageHeader = ({
  title,
  status,
  kicker,
  description,
  actions,
  density = "comfortable",
}: {
  title: ReactNode;
  status?: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  density?: "comfortable" | "compact";
}) => {
  const header = useStickyHeaderOffset();

  return (
    <header ref={header} className={styles.header} data-density={density}>
      {kicker && <p className={styles.kicker}>{kicker}</p>}
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{title}</h1>
        {status}
      </div>
      {description && <div className={styles.description}>{description}</div>}
      {actions && (
        <div className={styles.actions} data-page-actions>
          {actions}
        </div>
      )}
    </header>
  );
};

/**
 * On desktop the header stays at the top of the page while the page scrolls beneath it. It
 * publishes its height to the page as --page-header-height so sticky regions further down, such as
 * a collection's toolbar and table header, settle below it. A contained page scrolls its own regions
 * under a header that never moves, so nothing needs the offset there.
 */
const useStickyHeaderOffset = () => {
  const header = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = header.current;
    const container = element?.parentElement;
    if (
      !element ||
      !container ||
      element.closest("[data-contained]") ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const publish = () =>
      container.style.setProperty(
        "--page-header-height",
        `${getComputedStyle(element).position === "sticky" ? element.getBoundingClientRect().height : 0}px`,
      );

    // The header sticks only on tall, wide screens, so crossing that threshold changes the offset
    // even when the header itself keeps its size.
    const sticky = window.matchMedia("(min-width: 901px) and (min-height: 600px)");
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    sticky.addEventListener("change", publish);
    return () => {
      observer.disconnect();
      sticky.removeEventListener("change", publish);
      container.style.removeProperty("--page-header-height");
    };
  }, []);
  return header;
};
