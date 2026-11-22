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
import { Heading } from "react-aria-components/Dialog";

import { ButtonBase } from "../../components/button/button-base";
import framedStyles from "../../components/dialog/framed-dialog.module.css";
import { ModalFrame } from "../../components/dialog/modal-frame";
import { IconBase } from "../../components/icon/icon-base";
import scrollStyles from "../../foundations/scroll-area.module.css";
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
    setOpener(isOpen ? document.activeElement : opener);
  }

  const previouslyOpen = useRef(false);
  useEffect(() => {
    const closed = previouslyOpen.current && !isOpen;
    previouslyOpen.current = isOpen;
    if (!closed) {
      return;
    }
    // The dialog's own focus scope restores first; this covers a panel that was never modal. Focus
    // that is still somewhere on the page stays: the pushed panel leaves the page usable.
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) {
        restoreFocus(opener);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, opener]);
};

const CompanionHeader = ({
  label,
  titleId,
  closeLabel,
  onClose,
}: Pick<ApplicationCompanion, "label" | "closeLabel" | "onClose"> & { titleId?: string }) => (
  <div className={`${framedStyles.header} ${scrollStyles.dividerAfterStart}`}>
    <div className={framedStyles.heading}>
      {titleId ? (
        <h2 id={titleId} className={framedStyles.title}>
          {label}
        </h2>
      ) : (
        <Heading slot="title" className={framedStyles.title}>
          {label}
        </Heading>
      )}
    </div>
    <ButtonBase
      variant="quiet"
      iconOnly
      aria-label={closeLabel}
      className={framedStyles.close}
      onPress={onClose}
    >
      <IconBase name="close" />
    </ButtonBase>
  </div>
);

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

/** Pushes page content aside from 1400 pixels, and slides over it as a modal sheet below. */
export const CompanionPanel = ({
  label,
  isOpen,
  onClose,
  closeLabel,
  resizeLabel,
  width: startingWidth = companionWidthLimits.default,
  onWidthChange,
  children,
}: ApplicationCompanion) => {
  const push = useSyncExternalStore(subscribeViewport, isPushViewport, () => false);
  const [width, setWidth] = useState(() => clampWidth(startingWidth));
  const panel = useRef<HTMLElement>(null);
  const panelId = useId();
  const titleId = useId();
  useFocusReturn(isOpen);

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

  // Escape reaches here only when no menu or popup inside the panel has used it.
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      onClose();
    }
  };

  if (push && !isOpen) {
    return null;
  }

  return push ? (
    // Escape bubbles from the controls inside; the region itself is not a control.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <aside
      ref={panel}
      id={panelId}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={styles.panel}
      onKeyDown={closeOnEscape}
    >
      <ResizeSeparator
        label={resizeLabel}
        width={width}
        panelId={panelId}
        onResize={setWidth}
        onCommit={(committed) => onWidthChange?.(committed)}
      />
      <CompanionHeader label={label} titleId={titleId} closeLabel={closeLabel} onClose={onClose} />
      <div className={`${styles.body} ${scrollStyles.scrollArea}`}>{children}</div>
    </aside>
  ) : (
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
          <CompanionHeader label={label} closeLabel={closeLabel} onClose={close} />
          <div className={`${styles.body} ${scrollStyles.scrollArea}`}>{children}</div>
        </>
      )}
    </ModalFrame>
  );
};
