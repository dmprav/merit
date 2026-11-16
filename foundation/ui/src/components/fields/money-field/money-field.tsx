import { useId, useState, type ComponentProps } from "react";

import { moneyInput, normalizeMoneyInput } from "@merit/money/input";

import { TextField } from "../text-field/text-field";
import styles from "./money-field.module.css";

type MoneyFieldProps = Omit<
  ComponentProps<typeof TextField>,
  "value" | "defaultValue" | "onChange" | "inputMode" | "multiline" | "rows"
> & {
  value: string;
  onChange: (value: string) => void;
  precisionMessage: string;
};

/** Rejects invalid input without rounding; restored invalid values remain editable and exact. */
export const MoneyField = ({
  value,
  onChange,
  onBlur,
  precisionMessage,
  ...props
}: MoneyFieldProps) => {
  const [rejected, setRejected] = useState(false);
  const feedbackId = useId();
  return (
    <div className={styles.field}>
      <TextField
        {...props}
        value={value}
        inputMode="decimal"
        aria-describedby={
          [props["aria-describedby"], rejected ? feedbackId : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onChange={(next) => {
          const accepted =
            moneyInput(next) ??
            (moneyInput(value) === null && removesText(value, next) ? next : null);
          setRejected(accepted === null);
          if (accepted !== null) {
            onChange(accepted);
          }
        }}
        onBlur={(event) => {
          const normalized = normalizeMoneyInput(value);
          if (!props.isReadOnly && !props.isDisabled && normalized !== value) {
            onChange(normalized);
          }
          onBlur?.(event);
        }}
      />
      <span id={feedbackId} role="status" className={styles.feedback}>
        {rejected ? precisionMessage : ""}
      </span>
    </div>
  );
};

const removesText = (previous: string, next: string) => {
  if (next.length >= previous.length) {
    return false;
  }
  let start = 0;
  while (start < next.length && previous[start] === next[start]) {
    start += 1;
  }
  return previous.slice(start + previous.length - next.length) === next.slice(start);
};
