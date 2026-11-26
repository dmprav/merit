import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Tab, TabList, TabPanel, Tabs as AriaTabs } from "react-aria-components/Tabs";

import { ButtonBase } from "../button/button-base";
import { IconBase } from "../icon/icon-base";
import { AnchoredTooltip } from "../tooltip/tooltip";
import styles from "./tabs.module.css";

type TabsProps<Id extends string> = {
  label: string;
  scrollPanels?: boolean;
  scrollBackwardLabel: string;
  scrollForwardLabel: string;
  items: readonly {
    id: Id;
    label: ReactNode;
    count?: number;
    /** Explains why the count needs attention, both to assistive technology and on hover. */
    countWarning?: string;
    content: ReactNode;
    isDisabled?: boolean;
  }[];
  selectedKey?: Id;
  defaultSelectedKey?: Id;
  onSelectionChange?: (id: Id) => void;
};

const useTabStrip = <Id extends string>({
  items,
  selectedKey,
}: Pick<TabsProps<Id>, "items" | "selectedKey">) => {
  const rail = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const previousWidths = useRef<number[]>([]);
  const [scroll, setScroll] = useState({ overflow: false, backward: false, forward: false });

  useLayoutEffect(() => {
    const viewport = list.current;
    const container = rail.current;
    if (!viewport || !container || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateEdges = (overflow: boolean) => {
      const targets = getScrollTargets(viewport);
      const backward = !!targets.backward;
      const forward = !!targets.forward;
      setScroll((previous) =>
        previous.overflow === overflow &&
        previous.backward === backward &&
        previous.forward === forward
          ? previous
          : { overflow, backward, forward },
      );
    };

    let overflowing = false;

    const measure = () => {
      if (!container.clientWidth) {
        return;
      }

      const measured = measureTabOverflow(viewport, container);
      const tabs = measured.tabs;
      overflowing = measured.overflowing;
      viewport.style.setProperty("--tab-max-width", `${viewport.clientWidth}px`);

      if (!overflowing && controls.current?.contains(document.activeElement)) {
        viewport
          .querySelector<HTMLElement>('[aria-selected="true"]')
          ?.focus({ preventScroll: true });
      }

      const widths = [
        viewport.clientWidth,
        ...tabs.map((tab) => tab.getBoundingClientRect().width),
      ];
      const resized = widths.some((width, index) => width !== previousWidths.current[index]);
      const target =
        viewport.querySelector<HTMLElement>(":focus") ??
        (resized ? viewport.querySelector<HTMLElement>('[aria-selected="true"]') : null);
      if (target) {
        revealTab(viewport, target);
      }

      previousWidths.current = widths;
      updateEdges(overflowing);
    };

    const onScroll = () => updateEdges(overflowing);

    let frame = 0;
    const observer = new ResizeObserver(() => {
      // Measuring also sizes tabs; defer those writes outside ResizeObserver delivery.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(container);
    observer.observe(viewport);

    for (const tab of viewport.querySelectorAll('[role="tab"]')) {
      observer.observe(tab);
    }

    viewport.addEventListener("scroll", onScroll, { passive: true });
    measure();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [items, scroll.overflow]);

  useLayoutEffect(() => {
    const viewport = list.current;
    const selected = viewport?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (viewport && selected) {
      revealTab(viewport, selected);
    }
  }, [selectedKey]);

  const scrollToTab = (direction: "backward" | "forward") => {
    const viewport = list.current;
    if (!viewport || !scroll[direction]) {
      return;
    }

    const target = getScrollTargets(viewport)[direction];
    if (target) {
      revealTab(viewport, target);
    }
  };

  const revealFocusedTab = (tab: Element) => {
    // Reveal after focus handling restores the previous scroll position.
    requestAnimationFrame(() => {
      if (list.current && tab === document.activeElement) {
        revealTab(list.current, tab);
      }
    });
  };

  return { rail, list, controls, scroll, scrollToTab, revealFocusedTab };
};

/**
 * Switch between sibling sections of one page while keeping the page's context in view.
 *
 * Tabs keep their supplied order. Supply an optional numeric count separately from the label; zero
 * is shown, and counts are included in accessible names. Features decide what is counted. A
 * countWarning gives the badge an amber treatment and supplies its hover explanation and the tab's
 * accessible description; keep the underlying status visible in the panel too. When the row
 * overflows, scroll controls reveal neighboring tabs without selecting them. Left/Right moves
 * between tabs; Tab continues through the scroll controls to the panel. The first label's text aligns with the content edge, with hover fills reaching into the gutter. Long
 * labels stay on one line with an ellipsis and a tooltip, and each count stays visible.
 */
export const Tabs = <Id extends string>({
  label,
  scrollPanels = false,
  scrollBackwardLabel,
  scrollForwardLabel,
  items,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
}: TabsProps<Id>) => {
  const warningId = useId();
  const panelScroll = useRef(new Map<Id, number>());
  const { rail, list, controls, scroll, scrollToTab, revealFocusedTab } = useTabStrip({
    items,
    selectedKey,
  });

  return (
    <AriaTabs
      className={scrollPanels ? styles.scrollPanels : undefined}
      selectedKey={selectedKey}
      defaultSelectedKey={defaultSelectedKey}
      onSelectionChange={(key) => {
        const item = items.find((item) => item.id === key);
        if (item) {
          onSelectionChange?.(item.id);
        }
      }}
    >
      <div className={styles.toolbar}>
        <div ref={rail} className={styles.rail}>
          <TabList
            ref={list}
            aria-label={label}
            className={styles.list}
            data-overflow={scroll.overflow || undefined}
          >
            {items.map((item) => (
              <TabItem key={item.id} item={item} warningId={warningId} onFocus={revealFocusedTab} />
            ))}
          </TabList>
          <div ref={controls} className={styles.controls} hidden={!scroll.overflow}>
            <ButtonBase
              variant="quiet"
              iconOnly
              aria-label={scrollBackwardLabel}
              aria-disabled={!scroll.backward}
              onPress={() => scrollToTab("backward")}
            >
              <IconBase name="left" className={styles.direction} />
            </ButtonBase>
            <ButtonBase
              variant="quiet"
              iconOnly
              aria-label={scrollForwardLabel}
              aria-disabled={!scroll.forward}
              onPress={() => scrollToTab("forward")}
            >
              <IconBase name="right" className={styles.direction} />
            </ButtonBase>
          </div>
        </div>
      </div>
      {items.map((item) => (
        <TabPanel
          key={item.id}
          id={item.id}
          className={styles.panel}
          ref={(node) => {
            if (node && scrollPanels) {
              node.scrollTop = panelScroll.current.get(item.id) ?? 0;
            }
          }}
          onScroll={
            scrollPanels
              ? (event) => panelScroll.current.set(item.id, event.currentTarget.scrollTop)
              : undefined
          }
        >
          {item.content}
        </TabPanel>
      ))}
    </AriaTabs>
  );
};

const getScrollTargets = (viewport: HTMLElement) => {
  const bounds = viewport.getBoundingClientRect();
  const rtl = getComputedStyle(viewport).direction === "rtl";
  let backward: HTMLElement | undefined;
  let forward: HTMLElement | undefined;
  for (const tab of viewport.querySelectorAll<HTMLElement>('[role="tab"]')) {
    const rect = tab.getBoundingClientRect();
    if (rtl ? rect.right > bounds.right + 1 : rect.left < bounds.left - 1) {
      backward = tab;
    }
    if (!forward && (rtl ? rect.left < bounds.left - 1 : rect.right > bounds.right + 1)) {
      forward = tab;
    }
  }

  return { backward, forward };
};

// Scroll only the strip, never the page or the application panel.
const revealTab = (viewport: HTMLElement, tab: Element) => {
  const bounds = viewport.getBoundingClientRect();
  const rect = tab.getBoundingClientRect();
  const delta =
    rect.left < bounds.left
      ? rect.left - bounds.left
      : rect.right > bounds.right
        ? rect.right - bounds.right
        : 0;
  if (Math.abs(delta) > 1) {
    viewport.scrollBy({ left: delta, behavior: "instant" });
  }
};

const measureTabOverflow = (viewport: HTMLElement, container: HTMLElement) => {
  // Measure against the full rail before reserving arrow space, so controls cannot cause overflow themselves.
  viewport.style.setProperty("--tab-max-width", `${container.clientWidth}px`);
  const tabs = Array.from(viewport.querySelectorAll<HTMLElement>('[role="tab"]'));
  const gap = Number.parseFloat(getComputedStyle(viewport).columnGap) || 0;
  const width =
    tabs.reduce((sum, tab) => sum + tab.getBoundingClientRect().width, 0) +
    Math.max(0, tabs.length - 1) * gap;
  const overflowing = width > container.clientWidth + 1;
  return { tabs, overflowing };
};

const TabItem = <Id extends string>({
  item,
  warningId,
  onFocus,
}: {
  item: TabsProps<Id>["items"][number];
  warningId: string;
  onFocus: (tab: Element) => void;
}) => {
  return (
    <Tab
      id={item.id}
      isDisabled={item.isDisabled}
      aria-describedby={
        item.count != null && item.countWarning ? `${warningId}-${item.id}` : undefined
      }
      onFocus={(event) => onFocus(event.currentTarget)}
      className={styles.tab}
    >
      {({ isHovered, isFocusVisible }) => (
        <TabContent item={item} warningId={warningId} isReached={isHovered || isFocusVisible} />
      )}
    </Tab>
  );
};

/** Rendered inside the tab, where the label's real width can be measured. */
const TabContent = <Id extends string>({
  item,
  warningId,
  isReached,
}: {
  item: TabsProps<Id>["items"][number];
  warningId: string;
  /** The tab is hovered or has keyboard focus, so a cut-off label may be explained. */
  isReached: boolean;
}) => {
  const text = useRef<HTMLSpanElement>(null);
  const [cutOff, setCutOff] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Escape dismisses the tooltip until the tab is reached again.
  useEffect(() => {
    if (!isReached) {
      setDismissed(false);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setDismissed(true);

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isReached]);

  useLayoutEffect(() => {
    const node = text.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const measure = () =>
      setCutOff(node.scrollWidth > node.clientWidth ? (node.textContent ?? null) : null);

    const observer = new ResizeObserver(measure);

    measure();
    observer.observe(node);

    return () => observer.disconnect();
  }, [item.label]);

  return (
    <>
      <TabLabel item={item} warningId={warningId} text={text} />
      <AnchoredTooltip
        anchorRef={text}
        content={cutOff ?? ""}
        isOpen={cutOff != null && isReached && !dismissed}
      />
    </>
  );
};

const TabLabel = <Id extends string>({
  item,
  warningId,
  text,
}: {
  item: TabsProps<Id>["items"][number];
  warningId: string;
  text: Ref<HTMLSpanElement>;
}) => (
  <span className={styles.label}>
    <span ref={text} className={styles.text}>
      {item.label}
    </span>
    {item.count != null && (
      <>
        {" "}
        <span
          className={styles.count}
          data-warning={Boolean(item.countWarning) || undefined}
          title={item.countWarning}
        >
          {item.count}
        </span>
        {item.countWarning && (
          <span id={`${warningId}-${item.id}`} hidden>
            {item.countWarning}
          </span>
        )}
      </>
    )}
  </span>
);
