import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import framedStyles from "../../components/dialog/framed-dialog.module.css";
import { FramedHeader } from "../../components/dialog/framed-header";
import { ModalFrame } from "../../components/dialog/modal-frame";
import styles from "./companion-panel.module.css";

const pushQuery = "(min-width: 1400px)";

/** Resizing is limited to these widths, in CSS pixels. */
const companionWidthLimits = { min: 400, max: 560, default: 416 } as const;
const keyboardStep = 16;
/** A press that moves less than this many pixels is a click, not a drag. */
const clickSlop = 3;

const subscribeViewport = (onChange: () => void) => {
  const media = window.matchMedia(pushQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const isPushViewport = () => window.matchMedia(pushQuery).matches;

const clampWidth = (width: number) =>
  Math.min(companionWidthLimits.max, Math.max(companionWidthLimits.min, Math.round(width)));

export type ApplicationCompanion = {
  /** Names the panel and is its visible title. */
  label: string;
  isOpen: boolean;
  onClose: () => void;
  closeLabel: string;
  /** Names the separator that resizes the panel. */
  resizeLabel: string;
  /** The width when the panel first appears, from 400 to 560 pixels. The shell does not save it. */
  width?: number;
  /** Receives each width the person commits by resizing. */
  onWidthChange?: (width: number) => void;
  /**
   * Content is mounted only while the panel is open, and again when the screen crosses 1400 pixels,
   * so keep its state with the caller. Focus moves to an element with `autoFocus`, else to the panel.
   */
  children: ReactNode;
  /**
   * Stays below the scrolling content, in view however far it scrolls, such as the box a person
   * asks in. It mounts and remounts with the content.
   */
  footer?: ReactNode;
};

const restoreFocus = (opener: Element | null) => {
  const target =
    opener instanceof HTMLElement && opener !== document.body && opener.isConnected
      ? opener
      : document.getElementById("main");
  target?.focus({ preventScroll: true });
};

/** Remembers what had focus as the panel opened and puts focus back when it closes. */
const useFocusReturn = (isOpen: boolean) => {
  const [opener, setOpener] = useState<Element | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    // Content with autoFocus takes focus while the panel mounts, so read it before then.
    // Server rendering has no document, and nothing has focus to return to.
    setOpener(isOpen && typeof document !== "undefined" ? document.activeElement : opener);
  }

  const previouslyOpen = useRef(false);
  useEffect(() => {
    const closed = previouslyOpen.current && !isOpen;
    previouslyOpen.current = isOpen;
    if (!closed) {
      return;
    }
    // The pushed panel unmounts at once. Focus that is still somewhere on the page stays: the
    // pushed panel leaves the page usable.
    const frame = requestAnimationFrame(() => restoreLostFocus(opener));
    return () => cancelAnimationFrame(frame);
  }, [isOpen, opener]);

  return opener;
};

const restoreLostFocus = (opener: Element | null) => {
  const active = document.activeElement;
  if (!active || active === document.body || !active.isConnected) {
    restoreFocus(opener);
  }
};

/**
 * The sheet's exit animation keeps it mounted after it closes, and its focus scope then restores
 * to whatever had focus when the sheet opened, which may be gone after crossing 1400 pixels.
 * Once the sheet is actually removed, put lost focus back on the opener.
 */
const ReturnFocusWhenSheetUnmounts = ({ opener }: { opener: Element | null }) => {
  const latest = useRef(opener);
  useEffect(() => {
    latest.current = opener;
  });
  useEffect(
    () => () => {
      // After the focus scope has restored its own target.
      requestAnimationFrame(() => restoreLostFocus(latest.current));
    },
    [],
  );
  return null;
};

/** Moving the separator left widens the panel; Home and End jump to the limits. */
const widthAfterKey = (key: string, width: number) => {
  switch (key) {
    case "ArrowLeft":
      return width + keyboardStep;
    case "ArrowRight":
      return width - keyboardStep;
    case "Home":
      return companionWidthLimits.min;
    case "End":
      return companionWidthLimits.max;
    default:
      return null;
  }
};

/** A window splitter on the panel's leading edge; dragging left widens the panel. */
const ResizeSeparator = ({
  label,
  width,
  panelId,
  onResize,
  onCommit,
}: {
  label: string;
  width: number;
  panelId: string;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
}) => {
  const [dragging, setDragging] = useState(false);
  const origin = useRef({ x: 0, width });
  const moved = useRef(false);
  const latest = useRef(width);
  const resize = useEffectEvent(onResize);
  const commit = useEffectEvent(onCommit);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const move = (event: globalThis.PointerEvent) => {
      if (Math.abs(event.clientX - origin.current.x) >= clickSlop) {
        moved.current = true;
      }
      if (!moved.current) {
        return;
      }
      latest.current = clampWidth(origin.current.width + origin.current.x - event.clientX);
      resize(latest.current);
    };

    const end = (event: globalThis.PointerEvent) => {
      setDragging(false);
      if (moved.current) {
        commit(latest.current);
      } else if (event.type === "pointerup") {
        // A press without dragging is the single-pointer way to resize: toggle default and widest.
        const next =
          origin.current.width === companionWidthLimits.default
            ? companionWidthLimits.max
            : companionWidthLimits.default;
        resize(next);
        commit(next);
      }
    };

    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    return () => {
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
    };
  }, [dragging]);

  const startDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.focus();
    origin.current = { x: event.clientX, width };
    latest.current = width;
    moved.current = false;
    setDragging(true);
  };

  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = widthAfterKey(event.key, width);
    if (next == null) {
      return;
    }
    event.preventDefault();
    const clamped = clampWidth(next);
    if (clamped !== width) {
      // A drag still in progress commits from here, not from where the pointer left it.
      latest.current = clamped;
      onResize(clamped);
      onCommit(clamped);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={panelId}
      aria-valuenow={width}
      aria-valuemin={companionWidthLimits.min}
      aria-valuemax={companionWidthLimits.max}
      tabIndex={0}
      className={styles.separator}
      data-dragging={dragging || undefined}
      onPointerDown={startDragging}
      onKeyDown={step}
    />
  );
};

/** The scrolling content under the header, with the footer that stays below it. */
const PanelBody = ({
  label,
  footer,
  children,
}: Pick<ApplicationCompanion, "footer" | "children"> & { label: string }) => (
  <>
    <div role="region" aria-label={label} tabIndex={0} className={styles.body}>
      {children}
    </div>
    {footer && <div className={styles.footer}>{footer}</div>}
  </>
);

/** Escape reaches the panel only when no menu or popup inside it has used it. */
const closeOnEscape = (onClose: () => void) => (event: KeyboardEvent<HTMLElement>) => {
  // Escape that cancels an IME composition belongs to the composition, as in the modal sheet.
  if (event.key === "Escape" && !event.nativeEvent.isComposing) {
    onClose();
  }
};

/** Below 1400 pixels the panel is a modal sheet, like a side panel. */
const CompanionSheet = ({
  isOpen,
  onClose,
  opener,
  label,
  closeLabel,
  footer,
  children,
}: Pick<ApplicationCompanion, "isOpen" | "onClose" | "closeLabel" | "footer" | "children"> & {
  opener: Element | null;
  label: string;
}) => (
  <ModalFrame
    isOpen={isOpen}
    isDismissable
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    classNames={{
      overlay: `${framedStyles.sidePanelOverlay} ${styles.sheetOverlay}`,
      modal: `${framedStyles.sidePanel} ${styles.sheet}`,
      dialog: framedStyles.dialog,
    }}
    frame="end"
  >
    {(close) => (
      <>
        <ReturnFocusWhenSheetUnmounts opener={opener} />
        <FramedHeader title={label} closeLabel={closeLabel} close={close} />
        <PanelBody label={label} footer={footer}>
          {children}
        </PanelBody>
      </>
    )}
  </ModalFrame>
);

// A panel the person opens moves into place; one already open as the page loads stays still.
// Returns the panel's data-opening value: true once the panel has been closed, otherwise absent.
const useOpening = (isOpen: boolean) => {
  const [hasBeenClosed, setHasBeenClosed] = useState(!isOpen);
  if (!isOpen && !hasBeenClosed) {
    setHasBeenClosed(true);
  }
  return hasBeenClosed || undefined;
};

/** Pushes page content aside from 1400 pixels, and slides over it as a modal sheet below. */
export const CompanionPanel = ({
  label,
  isOpen,
  onClose,
  closeLabel,
  resizeLabel,
  width: startingWidth = companionWidthLimits.default,
  onWidthChange,
  ...content
}: ApplicationCompanion) => {
  const push = useSyncExternalStore(subscribeViewport, isPushViewport, () => false);
  const [width, setWidth] = useState(() => clampWidth(startingWidth));
  const panel = useRef<HTMLElement>(null);
  const panelId = useId();
  const titleId = useId();
  const opener = useFocusReturn(isOpen);
  const opening = useOpening(isOpen);

  // The document holds the width so page-level overlays, such as toasts, center beside the panel.
  useLayoutEffect(() => {
    if (!isOpen || !push) {
      return;
    }
    document.documentElement.style.setProperty("--companion-width", `${width}px`);
    return () => {
      document.documentElement.style.removeProperty("--companion-width");
    };
  }, [isOpen, push, width]);

  useEffect(() => {
    if (isOpen && push && !panel.current?.contains(document.activeElement)) {
      panel.current?.focus({ preventScroll: true });
    }
  }, [isOpen, push]);

  if (push && !isOpen) {
    return null;
  }

  return push ? (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape bubbles from the controls inside; the region itself is not a control.
    <aside
      ref={panel}
      id={panelId}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={styles.panel}
      // The shell opens the panel's column with it.
      data-companion-panel=""
      data-opening={opening}
      onKeyDown={closeOnEscape(onClose)}
    >
      <ResizeSeparator
        label={resizeLabel}
        width={width}
        panelId={panelId}
        onResize={setWidth}
        onCommit={(committed) => onWidthChange?.(committed)}
      />
      <FramedHeader title={label} titleId={titleId} closeLabel={closeLabel} close={onClose} />
      <PanelBody label={label} {...content} />
    </aside>
  ) : (
    <CompanionSheet
      isOpen={isOpen}
      onClose={onClose}
      opener={opener}
      label={label}
      closeLabel={closeLabel}
      {...content}
    />
  );
};
