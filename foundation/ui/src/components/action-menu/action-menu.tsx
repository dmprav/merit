import {
  cloneElement,
  useEffect,
  useRef,
  type ComponentProps,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Menu, MenuItem, MenuTrigger, Pressable } from "react-aria-components/Menu";
import { Popover } from "react-aria-components/Popover";

import rowStyles from "../../foundations/list-row.module.css";
import { IconBase, type IconName } from "../icon/icon-base";
import { Tooltip } from "../tooltip/tooltip";
import styles from "./action-menu.module.css";

// React Aria opens the macOS keyboard context menu asynchronously. Prevent a
// real link's native Enter navigation before that platform fallback can run.
const keepContextMenuOnLink = (event: KeyboardEvent) => {
  if (event.ctrlKey && event.key === "Enter" && navigator.platform.includes("Mac")) {
    event.preventDefault();
  }
};

const ContextTrigger = ({ trigger }: { trigger: ComponentProps<typeof Pressable>["children"] }) => (
  <Pressable>
    {
      cloneElement(trigger, {
        onKeyDown: (event) => {
          keepContextMenuOnLink(event);
          trigger.props.onKeyDown?.(event);
        },
      }) as typeof trigger
    }
  </Pressable>
);

const MenuFocusGuard = ({ menuRef }: { menuRef: RefObject<HTMLDivElement | null> }) => {
  useEffect(() => {
    const ensureFocus = () => {
      const menu = menuRef.current;

      if (!menu) {
        return;
      }

      const container = menu.closest('[role="dialog"]') ?? menu;

      if (!container.contains(document.activeElement)) {
        menu.focus({ preventScroll: true });
      }
    };

    ensureFocus();
    const frame = requestAnimationFrame(ensureFocus);
    return () => cancelAnimationFrame(frame);
  }, [menuRef]);

  return null;
};

/**
 * Use ActionMenu for secondary commands; keep important actions in visibly labeled buttons. Items
 * invoke callbacks. Use real links for destinations and Select for field values. See [control
 * selection](?path=/docs/overview--docs#choose-controls-by-outcome) for the related patterns.
 */
export const ActionMenu = ({
  label,
  trigger,
  items,
  onAction,
  activation = "press",
  tooltip,
}: {
  label: string;
  trigger: ComponentProps<typeof Pressable>["children"];
  /** Context menus preserve the link's normal navigation and use platform right-click/long-press gestures. */
  activation?: "press" | "contextMenu";
  tooltip?: string;
  /** Give every item an icon or none, so labels stay aligned. */
  items: readonly { id: string; label: string; icon?: IconName }[];
  onAction: (id: string) => void;
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  return (
    <MenuTrigger trigger={activation}>
      {activation === "contextMenu" ? (
        tooltip ? (
          <Tooltip content={tooltip}>
            <ContextTrigger trigger={trigger} />
          </Tooltip>
        ) : (
          <ContextTrigger trigger={trigger} />
        )
      ) : (
        trigger
      )}
      <Popover
        placement={activation === "contextMenu" ? undefined : "bottom end"}
        offset={activation === "contextMenu" ? 0 : 4}
        className={styles.popover}
      >
        <MenuFocusGuard menuRef={menuRef} />
        <Menu
          ref={menuRef}
          aria-label={label}
          className={styles.menu}
          onAction={(key) => onAction(String(key))}
        >
          {items.map((item) => (
            <MenuItem id={item.id} key={item.id} textValue={item.label} className={rowStyles.row}>
              {item.icon && (
                <span className={rowStyles.leading}>
                  <IconBase name={item.icon} />
                </span>
              )}
              <span className={rowStyles.copy}>{item.label}</span>
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
};
