import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Button as RowButton } from "react-aria-components/Button";

import { ButtonBase } from "../../components/button/button-base";
import { ChipBase } from "../../components/chip/chip-base";
import { PickerPopover } from "../../components/dialog/dialog";
import { SearchField } from "../../components/fields/search-field/search-field";
import { Select, type SelectProps } from "../../components/fields/select/select";
import { IconBase } from "../../components/icon/icon-base";
import { Tooltip } from "../../components/tooltip/tooltip";
import rowStyles from "../../foundations/list-row.module.css";
import { popoverScroller } from "../../foundations/popover";
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
  /** One command that adds to the collection, at the toolbar's end, such as Add application. */
  action?: ReactNode;
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
  action,
}: CollectionToolbarProps) => {
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const toolbar = useStickyOffset();

  return (
    <div ref={toolbar} className={styles.toolbar}>
      <PickerPopover
        title={filterTitle}
        placement="bottom start"
        trigger={
          <Tooltip content={filterLabel}>
            <ButtonBase ref={filterTrigger} variant="quiet" iconOnly aria-label={filterLabel}>
              <IconBase name="filter" />
            </ButtonBase>
          </Tooltip>
        }
      >
        <FilterPanel filters={filters} search={search} reset={reset} />
      </PickerPopover>
      {chips.map((chip) => (
        <ChipBase
          key={chip.id}
          label={chip.label}
          removeLabel={chip.removeLabel}
          onRemove={() => {
            chip.onRemove();
            filterTrigger.current?.focus();
          }}
        />
      ))}
      {search?.value && (
        <ChipBase
          icon="search"
          label={search.value}
          removeLabel={`${search.clearLabel}: ${search.label}: ${search.value}`}
          onRemove={() => {
            search.onChange("");
            filterTrigger.current?.focus();
          }}
        />
      )}
      {summary != null && (
        <span className={styles.summary} role="status">
          {summary}
        </span>
      )}
      {action != null && <div className={styles.action}>{action}</div>}
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
      <div className={`${popoverScroller} ${styles.criteria}`}>{filters}</div>
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

/**
 * The toolbar stays in view, below a page header that also stays, while its collection scrolls. It
 * publishes its height to the surrounding content as --collection-toolbar-height, so a sticky table
 * header settles below both.
 */
const useStickyOffset = () => {
  const toolbar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = toolbar.current;
    const container = element?.parentElement;
    if (!element || !container || typeof ResizeObserver === "undefined") {
      return;
    }

    const publish = () =>
      container.style.setProperty(
        "--collection-toolbar-height",
        `${element.getBoundingClientRect().height}px`,
      );

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      container.style.removeProperty("--collection-toolbar-height");
    };
  }, []);
  return toolbar;
};
