import { useRef, type ReactNode } from "react";
import { Button as RowButton } from "react-aria-components/Button";

import { ButtonBase } from "../../components/button/button-base";
import { PickerPopover } from "../../components/dialog/dialog";
import { SearchField } from "../../components/fields/search-field/search-field";
import { Select, type SelectProps } from "../../components/fields/select/select";
import { IconBase } from "../../components/icon/icon-base";
import rowStyles from "../../foundations/list-row.module.css";
import styles from "./collection-toolbar.module.css";

type CollectionToolbarProps = {
  filterLabel: string;
  filterTitle: string;
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
        placement="bottom start"
        trigger={
          <ButtonBase ref={filterTrigger} variant="quiet" size="small">
            <IconBase name="filter" />
            {filterLabel}
          </ButtonBase>
        }
      >
        <FilterPanel filters={filters} search={search} reset={reset} />
      </PickerPopover>
      {chips.map((chip) => (
        <ButtonBase
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
          <IconBase name="close" />
        </ButtonBase>
      ))}
      {search?.value && (
        <ButtonBase
          variant="quiet"
          size="small"
          className={styles.chip}
          aria-label={`${search.clearLabel}: ${search.label}: ${search.value}`}
          onPress={() => {
            search.onChange("");
            filterTrigger.current?.focus();
          }}
        >
          <IconBase name="search" />
          <span>{search.value}</span>
          <IconBase name="close" />
        </ButtonBase>
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
    <div className={styles.filters} ref={filterPanel} data-list-content>
      {search && <SearchField {...search} appearance="header" autoFocus />}
      <div className={styles.criteria}>{filters}</div>
      {reset && !reset.isDisabled && (
        <div className={styles.reset}>
          <RowButton
            className={rowStyles.row}
            onPress={() => {
              reset.onReset();
              filterPanel.current?.querySelector<HTMLElement>("input, button")?.focus();
            }}
          >
            <span className={rowStyles.leading}>
              <IconBase name="reset" />
            </span>
            <span className={rowStyles.copy}>{reset.label}</span>
          </RowButton>
        </div>
      )}
    </div>
  );
};
