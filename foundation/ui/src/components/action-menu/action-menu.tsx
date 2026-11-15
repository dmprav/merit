import { cloneElement, type ComponentProps, type KeyboardEvent } from "react";
import { Menu, MenuItem, MenuTrigger, Pressable } from "react-aria-components/Menu";
import { Popover } from "react-aria-components/Popover";

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
  items: readonly { id: string; label: string }[];
  onAction: (id: string) => void;
}) => (
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
      <Menu aria-label={label} className={styles.menu} onAction={(key) => onAction(String(key))}>
        {items.map((item) => (
          <MenuItem id={item.id} key={item.id} className={styles.item}>
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </Popover>
  </MenuTrigger>
);
