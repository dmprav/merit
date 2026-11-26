import {
  createContext,
  use,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";

import { ActionMenu } from "../../components/action-menu/action-menu";
import { Button } from "../../components/button/button";
import { DialogFrameContext } from "../../components/dialog/dialog-content";
import {
  FrameBar,
  FrameBody,
  FrameFooter,
  FrameTitle,
  frameRoot,
} from "../../components/dialog/frame";
import { Icon } from "../../components/icon/icon";
import styles from "./reference-workspace.module.css";

/** Matches the stylesheet breakpoint where the panes stack and the document scrolls. */
export const stackedPanesQuery = "(max-width: 900px), (max-height: 599px)";

const ReadingViewportContext = createContext<RefObject<HTMLElement | null> | null>(null);

const WorkspaceContext = createContext<{ id: string; toReferenceLabel?: string } | null>(null);

const useWorkspace = () => {
  const workspace = use(WorkspaceContext);
  if (!workspace) {
    throw new Error("Reference and work panes must be placed inside ReferenceWorkspace.");
  }
  return workspace;
};

/**
 * Frames sustained work beside reference material. Place it in a contained
 * `ApplicationPage`: on desktop the header stays put and each pane scrolls on its own;
 * narrow screens stack the panes with links between them. Supply a `ReferencePane`
 * and a `WorkPane`, or a `WorkPane` alone when no reference material is available.
 */
export const ReferenceWorkspace = ({
  header,
  toWorkLabel,
  toReferenceLabel,
  after,
  children,
}: {
  /** Usually a compact `PageHeader`; it is inset to align with the panes. */
  header?: ReactNode;
  /** Names the link from the top of stacked panes to the work pane. */
  toWorkLabel?: string;
  /** Names the link from the work pane back to stacked reference material. */
  toReferenceLabel?: string;
  /** Content outside both panes, such as feedback announced for the whole page. */
  after?: ReactNode;
  children: ReactNode;
}) => {
  const id = useId();
  return (
    <WorkspaceContext value={{ id, toReferenceLabel }}>
      <div className={styles.view}>
        {header && <div className={styles.header}>{header}</div>}
        {toWorkLabel && (
          <a className={styles.jump} href={`${"#"}${id}-work`}>
            {toWorkLabel}
            <Icon name="down" />
          </a>
        )}
        <div className={styles.workspace}>{children}</div>
        {after}
      </div>
    </WorkspaceContext>
  );
};

/** The reading side. The scroll viewport is keyboard-focusable and named by `label`. */
export const ReferencePane = ({
  label,
  toolbar,
  viewportRef,
  children,
}: {
  label: string;
  /** Persistent controls above the scrolling content, such as a `ReferenceSwitcher`. */
  toolbar?: ReactNode;
  viewportRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) => {
  const { id } = useWorkspace();
  const viewport = useRef<HTMLDivElement>(null);
  useImperativeHandle(viewportRef, () => {
    const node = viewport.current;
    if (!node) {
      throw new Error("ReferencePane viewport is not mounted.");
    }
    return node;
  }, []);
  return (
    <ReadingViewportContext value={viewport}>
      <div {...frameRoot("pane", styles.reference)} id={`${id}-reference`}>
        {toolbar && <FrameBar>{toolbar}</FrameBar>}
        <FrameBody
          ref={viewport}
          data-reading-viewport
          tabIndex={0}
          role="group"
          aria-label={label}
        >
          {children}
        </FrameBody>
      </div>
    </ReadingViewportContext>
  );
};

/**
 * The working side. Its header shows `title`, or the pane's `label` when there is none,
 * with optional `titleActions`. Use `fill` when the child owns its scrolling and actions,
 * such as a `Form`; otherwise the pane scrolls and an optional `footer` keeps actions in reach.
 */
export const WorkPane = ({
  label,
  as: Element = "aside",
  title,
  titleRef,
  titleMeta,
  titleActions,
  footer,
  fill = false,
  children,
}: {
  label: string;
  /** Use `section` when the work is the page's main task rather than supporting it. */
  as?: "aside" | "section";
  /** Defaults to `label`. */
  title?: ReactNode;
  titleRef?: Ref<HTMLHeadingElement>;
  /** Compact status beside the title, such as a due-date badge and a control that explains it. */
  titleMeta?: ReactNode;
  titleActions?: ReactNode;
  footer?: ReactNode;
  fill?: boolean;
  children: ReactNode;
}) => {
  const { id, toReferenceLabel } = useWorkspace();
  const viewport = useRef<HTMLDivElement>(null);
  return (
    <ReadingViewportContext value={viewport}>
      <Element {...frameRoot("pane", styles.work)} id={`${id}-work`} aria-label={label}>
        {toReferenceLabel && (
          <a className={styles.jump} href={`${"#"}${id}-reference`}>
            {toReferenceLabel}
            <Icon name="ascending" />
          </a>
        )}
        <FrameBar>
          <FrameTitle plain title={title || label} titleRef={titleRef} focusable meta={titleMeta} />
          {titleActions}
        </FrameBar>
        {fill ? (
          // The child, such as a `Form`, supplies the frame's body and footer through `DialogContent`.
          <div ref={viewport} data-reading-viewport className={styles.fill}>
            <DialogFrameContext value={{ framed: true, title: label }}>
              {children}
            </DialogFrameContext>
          </div>
        ) : (
          <FrameBody
            ref={viewport}
            data-reading-viewport
            tabIndex={0}
            role="group"
            aria-label={label}
          >
            {children}
          </FrameBody>
        )}
        <FrameFooter>{footer && <div className={styles.footerRow}>{footer}</div>}</FrameFooter>
      </Element>
    </ReadingViewportContext>
  );
};

/** Chooses which reference material the reference pane shows. */
export const ReferenceSwitcher = <Key extends string>({
  label,
  triggerLabel,
  options,
  selected,
  onChange,
  triggerRef,
}: {
  label: string;
  /** Names the trigger together with the current choice, such as "Reference material: Guidelines". */
  triggerLabel: string;
  options: Record<Key, string>;
  selected: Key;
  onChange: (next: Key) => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) => {
  const entries: { id: Key; label: string }[] = [];
  for (const key in options) {
    if (Object.hasOwn(options, key)) {
      entries.push({ id: key, label: options[key] });
    }
  }

  return (
    <>
      <span className={styles.meta}>{label}</span>
      <ActionMenu
        label={label}
        trigger={
          <Button ref={triggerRef} variant="quiet" aria-label={triggerLabel}>
            {options[selected]}
            <Icon name="down" />
          </Button>
        }
        items={entries}
        onAction={(next) => {
          const match = entries.find((entry) => entry.id === next);
          if (match) {
            onChange(match.id);
          }
        }}
      />
    </>
  );
};

/**
 * Tracks the chosen reference and restores each one's scroll position when
 * people return to it. `moveReference` focuses the viewport unless called with
 * `focusViewport: false`, such as while an editor beside it keeps focus.
 */
export const useReferenceViewport = <Key extends string>(initial: Key) => {
  const [reference, setReference] = useState<Key>(initial);
  const referenceViewport = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Partial<Record<Key, number>>>({});
  const referenceFrame = useRef<number | null>(null);

  const moveReference = (next: Key, { focusViewport = true } = {}) => {
    scrollPositions.current[reference] = referenceViewport.current?.scrollTop ?? 0;
    setReference(next);
    if (referenceFrame.current !== null) {
      cancelAnimationFrame(referenceFrame.current);
    }
    referenceFrame.current = requestAnimationFrame(() => {
      referenceFrame.current = null;
      if (referenceViewport.current) {
        referenceViewport.current.scrollTop = scrollPositions.current[next] ?? 0;
      }
      if (focusViewport) {
        referenceViewport.current?.focus({ preventScroll: true });
      }
      if (window.matchMedia(stackedPanesQuery).matches) {
        referenceViewport.current?.scrollIntoView({ block: "start" });
      }
    });
  };

  useEffect(
    () => () => {
      if (referenceFrame.current !== null) {
        cancelAnimationFrame(referenceFrame.current);
      }
    },
    [],
  );

  return {
    reference,
    referenceViewport,
    moveReference,
    resetScroll: (target: Key) => {
      scrollPositions.current[target] = 0;
    },
  };
};

/**
 * Captures reading position before an in-pane list is replaced. Call the returned
 * restore function in a layout effect after the list mounts again, and restore
 * its trigger's focus with preventScroll. The physical scroll owner wins for
 * nested dialogs; stacked panes and standalone content use document scrolling.
 */
const useReadingPosition = (anchor: RefObject<HTMLElement | null>) => {
  const viewport = use(ReadingViewportContext);
  return () => {
    const owner = readingScrollOwner(
      anchor.current,
      anchor.current?.closest<HTMLElement>("[data-reading-viewport]") ?? viewport?.current ?? null,
    );
    const top = owner ? owner.scrollTop : window.scrollY;
    const left = owner ? owner.scrollLeft : window.scrollX;
    return () => {
      if (owner) {
        if (owner.isConnected) {
          owner.scrollTop = top;
          owner.scrollLeft = left;
        }
      } else {
        window.scrollTo({ top, left, behavior: "instant" });
      }
    };
  };
};

/**
 * Visits details within a pane and returns through their reading positions.
 * Attach root and heading to each destination. Resolve the originating control
 * after it remounts; Back restores its focus without moving the saved position.
 * Destinations and their labels remain feature-owned.
 */
export const useReadingNavigation = <Destination,>(initial: Destination | null = null) => {
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const capturePosition = useReadingPosition(root);

  type Visit = {
    destination: Destination | null;
    target: () => HTMLElement | null;
    restore: () => void;
  };

  const trail = useRef<Visit[]>([]);
  const returning = useRef<Visit | null>(null);
  const [navigation, setNavigation] = useState<{
    destination: Destination | null;
    previous: Destination | null;
  }>({ destination: initial, previous: null });

  useLayoutEffect(() => {
    if (returning.current) {
      returning.current.target()?.focus({ preventScroll: true });
      returning.current.restore();
      returning.current = null;
    } else if (navigation.destination !== null) {
      heading.current?.focus();
    }
  }, [navigation]);

  return {
    ...navigation,
    root,
    heading,
    /** Replace the trail when entering from outside the reading pane or returning to its list. */
    reset: (destination: Destination | null = null, target: Visit["target"] = () => null) => {
      trail.current =
        destination === null ? [] : [{ destination: null, target, restore: capturePosition() }];
      returning.current = null;
      setNavigation({ destination, previous: null });
    },
    open: (destination: Destination, target: Visit["target"]) => {
      trail.current.push({
        destination: navigation.destination,
        target,
        restore: capturePosition(),
      });
      setNavigation({ destination, previous: navigation.destination });
    },
    back: () => {
      returning.current = trail.current.pop() ?? null;
      setNavigation({
        destination: returning.current?.destination ?? null,
        previous: trail.current.at(-1)?.destination ?? null,
      });
    },
  };
};

const readingScrollOwner = (anchor: HTMLElement | null, viewport: HTMLElement | null) => {
  const stacked = window.matchMedia(stackedPanesQuery).matches;
  for (let element = anchor?.parentElement; element; element = element.parentElement) {
    if (element === viewport) {
      return stacked ? null : viewport;
    }
    if (/auto|scroll/.test(getComputedStyle(element).overflowY)) {
      return element;
    }
  }
  return null;
};
