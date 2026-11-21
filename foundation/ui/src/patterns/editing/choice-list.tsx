import { useState } from "react";
import { ListBox, ListBoxItem } from "react-aria-components/ListBox";
import { Input, TextField } from "react-aria-components/TextField";

import { Icon } from "../../components/icon/icon";
import rowStyles from "../../foundations/list-row.module.css";
import searchStyles from "../../foundations/popover-search.module.css";
import styles from "./choice-list.module.css";

/**
 * A searchable single choice for pickers: the search sits in the picker's own header, separated
 * from results by a divider, and each result uses the shared list row with a trailing check.
 */
export const ChoiceList = ({
  label,
  searchLabel,
  emptyLabel,
  items,
  selectedKey,
  onChoose,
  isDisabled = false,
}: {
  label: string;
  /** Names the search and shows as its placeholder. */
  searchLabel: string;
  emptyLabel: string;
  items: readonly { id: string; label: string; description?: string; isDisabled?: boolean }[];
  selectedKey: string | null;
  onChoose: (id: string) => void;
  isDisabled?: boolean;
}) => {
  const [search, setSearch] = useState("");
  const shown = items.filter((item) =>
    `${item.label} ${item.description ?? ""}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <div className={styles.picker} data-list-content>
      <TextField
        aria-label={searchLabel}
        value={search}
        onChange={setSearch}
        autoFocus
        isDisabled={isDisabled}
        className={searchStyles.search}
      >
        <Icon name="search" />
        <Input className={searchStyles.input} placeholder={searchLabel} />
      </TextField>
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
          <ListBoxItem id={item.id} textValue={item.label} className={rowStyles.row}>
            <span className={rowStyles.copy}>
              <span>{item.label}</span>
              {item.description && (
                <span className={rowStyles.description}>{item.description}</span>
              )}
            </span>
            <span className={rowStyles.trailing}>
              {item.id === selectedKey && <Icon name="check" />}
            </span>
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
};
