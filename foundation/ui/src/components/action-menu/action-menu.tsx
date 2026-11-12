import type { ReactNode } from "react";
import { Menu, MenuItem, MenuTrigger } from "react-aria-components/Menu";
import { Popover } from "react-aria-components/Popover";

import styles from "./action-menu.module.css";

export const ActionMenu = ({
  label,
  trigger,
  items,
  onAction,
}: {
  label: string;
  trigger: ReactNode;
  items: readonly { id: string; label: string }[];
  onAction: (id: string) => void;
}) => (
  <MenuTrigger>
    {trigger}
    <Popover placement="bottom end" offset={4} className={styles.popover}>
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
