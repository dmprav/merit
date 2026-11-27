import { useEffect, useEffectEvent, useRef, useState, type ReactNode, type RefObject } from "react";
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
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isOverContent, setIsOverContent] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const hoverOpen = useDelayed(isHovered);
  // The pointer can only be over the text while it shows, so it keeps the text open through a
  // handoff from focus or hover, whatever the delayed hover state says.
  const wanted = isFocused || hoverOpen || isOverContent;
  const isOpen = isPinned || (wanted && !isDismissed);

  useEffect(() => {
    if (!isOpen) {
      setIsOverContent(false);
    }
  }, [isOpen]);

  // A dismissal lasts until the preview would close anyway, then resets for the next time.
  useEffect(() => {
    if (!wanted) {
      setIsDismissed(false);
    }
  }, [wanted]);

  useDismissal(isOpen, trigger, content, () => {
    setIsPinned(false);
    setIsDismissed(true);
  });

  const toggle = () => {
    if (isPinned) {
      setIsPinned(false);
      setIsDismissed(true);
    } else {
      setIsPinned(true);
    }
  };

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
        <div role="group" aria-label={label}>
          {children}
        </div>
      </Popover>
    </>
  );
};
