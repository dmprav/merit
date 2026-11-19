import { useRef, type ReactNode } from "react";

import { Button } from "../../components/button/button";
import { PickerPopover } from "../../components/dialog/dialog";
import { SearchField } from "../../components/fields/search-field/search-field";
import { Select, type SelectProps } from "../../components/fields/select/select";
import { Icon } from "../../components/icon/icon";
import styles from "./collection-toolbar.module.css";

type CollectionToolbarProps = {
  filterLabel: string;
  filterTitle: string;
  closeLabel: string;
  filters: ReactNode;
  chips?: readonly { id: string; label: string; removeLabel: string; onRemove: () => void }[];
  /** The feature decides whether its current criteria can be reset. */
  reset?: { label: string; onReset: () => void; isDisabled?: boolean };
  search?: {
    label: string;
    clearLabel: string;
    placeholder?: string;
    maxLength?: number;
    value: string;
    onChange: (value: string) => void;
  };
  summary?: ReactNode;
};

/** An immediately applied collection criterion using the shared select interaction. */
export const CollectionFilter = <Id extends string>(
  props: Pick<
    SelectProps<Id>,
    "label" | "items" | "selectedKey" | "onSelectionChange" | "isDisabled"
  >,
) => <Select {...props} appearance="criterion" />;

/** Feature-owned filters and search retain their values when their controls close. */
export const CollectionToolbar = ({
  filterLabel,
  filterTitle,
  closeLabel,
  filters,
  chips = [],
  reset,
  search,
  summary,
}: CollectionToolbarProps) => {
  const filterTrigger = useRef<HTMLButtonElement>(null);

  return (
    <div className={styles.toolbar}>
      <PickerPopover
        title={filterTitle}
        closeLabel={closeLabel}
        placement="bottom start"
        trigger={
          <Button ref={filterTrigger} variant="quiet" size="small">
            <Icon name="filter" />
            {filterLabel}
          </Button>
        }
      >
        <FilterPanel filters={filters} search={search} reset={reset} />
      </PickerPopover>
      {chips.map((chip) => (
        <Button
          key={chip.id}
          variant="quiet"
          size="small"
          className={styles.chip}
          aria-label={chip.removeLabel}
          onPress={() => {
            chip.onRemove();
            filterTrigger.current?.focus();
          }}
        >
          <span>{chip.label}</span>
          <Icon name="close" />
        </Button>
      ))}
      {search?.value && (
        <Button
          variant="quiet"
          size="small"
          className={styles.chip}
          aria-label={`${search.clearLabel}: ${search.label}: ${search.value}`}
          onPress={() => {
            search.onChange("");
            filterTrigger.current?.focus();
          }}
        >
          <Icon name="search" />
          <span>{search.value}</span>
          <Icon name="close" />
        </Button>
      )}
      {summary != null && (
        <span className={styles.summary} role="status">
          {summary}
        </span>
      )}
    </div>
  );
};

const FilterPanel = ({
  filters,
  search,
  reset,
}: Pick<CollectionToolbarProps, "filters" | "search" | "reset">) => {
  const filterPanel = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.filters} ref={filterPanel}>
      {search && <SearchField {...search} autoFocus />}
      <div className={styles.criteria}>{filters}</div>
      {reset && !reset.isDisabled && (
        <Button
          variant="quiet"
          size="small"
          className={styles.reset}
          onPress={() => {
            reset.onReset();
            filterPanel.current?.querySelector<HTMLElement>("input, button")?.focus();
          }}
        >
          <Icon name="reset" />
          {reset.label}
        </Button>
      )}
    </div>
  );
};
