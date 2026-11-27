import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Popover } from "react-aria-components/Popover";

import { popoverContainerPadding, popoverOffset, popoverSurface } from "../../foundations/popover";
import { ButtonBase } from "../button/button-base";
import { IconBase, toneIcons } from "../icon/icon-base";
import { useDelayed } from "../tooltip/tooltip-base";
import styles from "./toggletip.module.css";

/**
 * While open, Escape anywhere and a press outside the given parts dismiss. Escape stops there so a
 * dialog around the toggletip stays open.
 */
const useDismissal = (
  isOpen: boolean,
  trigger: RefObject<Element | null>,
  content: RefObject<Element | null>,
  dismiss: () => void,
) => {
  const onDismiss = useEffectEvent(dismiss);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onDismiss();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const { target } = event;
      if (
        target instanceof Node &&
        !trigger.current?.contains(target) &&
        !content.current?.contains(target)
      ) {
        onDismiss();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [isOpen, trigger, content]);
};

/**
 * When the text shows: previewed on hover or keyboard focus after the shared delay, kept while the
 * pointer is over it, pinned by a press, and dismissed by Escape or a press elsewhere.
 */
const useToggletipState = (
  trigger: RefObject<Element | null>,
  content: RefObject<Element | null>,
) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isOverContent, setIsOverContent] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const hoverOpen = useDelayed(isHovered || isOverContent);
  // The pointer over the text keeps it open, and the shared delay covers the move back to the
  // button and the move away.
  const wanted = isFocused || hoverOpen || isOverContent;
  // Hover or focus that shows a preview now or will once the delay passes.
  const engaged = wanted || isHovered;
  const isOpen = isPinned || (wanted && !isDismissed);

  useEffect(() => {
    if (!isOpen) {
      setIsOverContent(false);
    }
  }, [isOpen]);

  // A dismissal lasts until the preview would close anyway, then resets for the next time.
  useEffect(() => {
    if (!engaged) {
      setIsDismissed(false);
    }
  }, [engaged]);

  // Only a current or pending preview stays dismissed; after a touch pin there is none, so the
  // next hover or keyboard focus still previews.
  const dismiss = () => {
    setIsPinned(false);
    setIsDismissed(engaged);
  };

  useDismissal(isOpen, trigger, content, dismiss);

  return {
    isOpen,
    setIsHovered,
    setIsFocused,
    setIsOverContent,
    toggle: () => (isPinned ? dismiss() : setIsPinned(true)),
  };
};

/**
 * An info icon that explains something brief beside a value. It previews its text on hover or
 * keyboard focus like a tooltip, and pins it open on press or tap so it can be read at leisure.
 * The text stays open while the pointer is over it; Escape or a press elsewhere closes it. The
 * button needs a `label` that names the topic, and `children` is plain or short inline text:
 * keep anything needed to finish the task visible beside it instead. Use `tone="warning"` for a
 * qualification the reader should not miss.
 */
export const Toggletip = ({
  label,
  children,
  tone = "info",
}: {
  /** Names the button, such as "About this request". */
  label: string;
  children: ReactNode;
  tone?: "info" | "warning";
}) => {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { isOpen, setIsHovered, setIsFocused, setIsOverContent, toggle } = useToggletipState(
    trigger,
    content,
  );

  return (
    <>
      <ButtonBase
        ref={trigger}
        variant="quiet"
        iconOnly
        className={styles.trigger}
        data-tone={tone}
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={isOpen ? id : undefined}
        aria-describedby={isOpen ? `${id}-text` : undefined}
        onPress={toggle}
        onHoverChange={setIsHovered}
        onFocus={(event) => setIsFocused(event.target.matches(":focus-visible"))}
        onBlur={() => setIsFocused(false)}
      >
        <IconBase name={toneIcons[tone]} />
      </ButtonBase>
      <Popover
        ref={content}
        isOpen={isOpen}
        isNonModal
        triggerRef={trigger}
        placement="bottom start"
        offset={popoverOffset}
        containerPadding={popoverContainerPadding}
        className={`${popoverSurface} ${styles.content}`}
        onPointerEnter={() => setIsOverContent(true)}
        onPointerLeave={() => setIsOverContent(false)}
      >
        <div id={id} role="group" aria-label={label}>
          <div id={`${id}-text`}>{children}</div>
        </div>
      </Popover>
    </>
  );
};
