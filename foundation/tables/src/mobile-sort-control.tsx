import { Select } from "@merit/ui/select";

import styles from "./data-table.module.css";
import type { TableSort, TableSorting } from "./types";

const selectionKey = (value: TableSort) =>
  value ? JSON.stringify([value.columnId, value.direction]) : "original";

export const MobileSortControl = ({
  columns,
  value,
  onChange,
  labels,
}: TableSorting & { columns: readonly { id: string; header: string }[] }) => {
  const options = [
    { id: selectionKey(null), label: labels.original, value: null },
    ...columns.flatMap((column) =>
      (["ascending", "descending"] as const).map((direction) => {
        const value = { columnId: column.id, direction };

        return {
          id: selectionKey(value),
          label: `${column.header} (${labels[direction]})`,
          value,
        };
      }),
    ),
  ];

  return (
    <div className={styles.mobileSorting}>
      <Select
        label={labels.by}
        items={options}
        selectedKey={selectionKey(value)}
        onSelectionChange={(id) => {
          const option = options.find((option) => option.id === id);
          if (option) {
            onChange(option.value);
          }
        }}
      />
    </div>
  );
};
