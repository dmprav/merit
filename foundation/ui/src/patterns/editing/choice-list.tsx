import { useState, type ReactNode } from "react";
import { ListBox, ListBoxItem } from "react-aria-components/ListBox";

import { TextField } from "../../components/fields/text-field/text-field";
import { Icon } from "../../components/icon/icon";
import styles from "./choice-list.module.css";

export const ChoiceList = ({
  label,
  searchLabel,
  emptyLabel,
  items,
  selectedKey,
  onChoose,
  headerActions,
  isDisabled = false,
}: {
  label: string;
  searchLabel: string;
  emptyLabel: string;
  items: readonly { id: string; label: string; description?: string; isDisabled?: boolean }[];
  selectedKey: string | null;
  onChoose: (id: string) => void;
  /** Actions beside search, such as a containing picker's close button. */
  headerActions?: ReactNode;
  isDisabled?: boolean;
}) => {
  const [search, setSearch] = useState("");
  const shown = items.filter((item) =>
    `${item.label} ${item.description ?? ""}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <TextField
          className={styles.search}
          label={searchLabel}
          value={search}
          onChange={setSearch}
          autoFocus
          isDisabled={isDisabled}
        />
        {headerActions}
      </div>
      <ListBox
        aria-label={label}
        selectionMode="single"
        selectionBehavior="toggle"
        selectedKeys={
          shown.some((item) => item.id === selectedKey) && selectedKey ? [selectedKey] : []
        }
        disallowEmptySelection
        onSelectionChange={(keys) => {
          if (keys === "all" || isDisabled) {
            return;
          }

          const chosen = keys.values().next().value;
          if (chosen !== undefined) {
            onChoose(String(chosen));
          }
        }}
        disabledKeys={items.filter((item) => isDisabled || item.isDisabled).map((item) => item.id)}
        className={styles.list}
        items={shown}
        renderEmptyState={() => <span className={styles.empty}>{emptyLabel}</span>}
      >
        {(item) => (
          <ListBoxItem id={item.id} textValue={item.label} className={styles.option}>
            <span>
              <span className={styles.label}>{item.label}</span>
              {item.description && <span className={styles.description}>{item.description}</span>}
            </span>
            {item.id === selectedKey && <Icon name="check" />}
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
};
