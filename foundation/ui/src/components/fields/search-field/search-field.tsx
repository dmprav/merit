import { useRef } from "react";
import { Input, TextField } from "react-aria-components/TextField";

import { Button } from "../../button/button";
import { Icon } from "../../icon/icon";
import fieldStyles from "../field.module.css";
import inputStyles from "../input.module.css";
import styles from "./search-field.module.css";

/** A scoped search with one field boundary; clearing preserves input focus. Escape belongs to its container. */
export const SearchField = ({
  label,
  clearLabel,
  value,
  onChange,
  placeholder = label,
  autoFocus,
  isDisabled,
  maxLength,
}: {
  label: string;
  clearLabel: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  isDisabled?: boolean;
  maxLength?: number;
}) => {
  const input = useRef<HTMLInputElement>(null);

  return (
    <TextField
      className={fieldStyles.field}
      aria-label={label}
      type="search"
      value={value}
      onChange={onChange}
      autoFocus={autoFocus}
      isDisabled={isDisabled}
      maxLength={maxLength}
    >
      <div className={`${inputStyles.inputGroup} ${styles.field}`}>
        <Icon name="search" className={styles.icon} />
        <Input ref={input} className={inputStyles.input} placeholder={placeholder} />
        {value && (
          <Button
            variant="quiet"
            size="small"
            iconOnly
            aria-label={clearLabel}
            isDisabled={isDisabled}
            onPress={() => {
              onChange("");
              input.current?.focus();
            }}
          >
            <Icon name="close" />
          </Button>
        )}
      </div>
    </TextField>
  );
};
