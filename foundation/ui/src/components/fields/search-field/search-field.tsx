import { useRef } from "react";
import { Input, TextField } from "react-aria-components/TextField";

import searchStyles from "../../../foundations/popover-search.module.css";
import { ButtonBase } from "../../button/button-base";
import { IconBase } from "../../icon/icon-base";
import fieldStyles from "../field.module.css";
import inputStyles from "../input.module.css";
import styles from "./search-field.module.css";

/**
 * A scoped search with one field boundary; clearing preserves input focus. Escape belongs to its
 * container. appearance=header heads a popover list instead, without a boundary of its own.
 */
export const SearchField = ({
  label,
  clearLabel,
  value,
  onChange,
  placeholder = label,
  autoFocus,
  isDisabled,
  maxLength,
  appearance = "field",
}: {
  appearance?: "field" | "header";
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
      <div
        className={
          appearance === "header"
            ? searchStyles.search
            : `${inputStyles.inputGroup} ${styles.field}`
        }
      >
        <IconBase name="search" className={appearance === "header" ? undefined : styles.icon} />
        <Input
          ref={input}
          className={appearance === "header" ? searchStyles.input : inputStyles.input}
          placeholder={placeholder}
        />
        {value && (
          <ButtonBase
            variant="quiet"
            iconOnly
            aria-label={clearLabel}
            isDisabled={isDisabled}
            onPress={() => {
              onChange("");
              input.current?.focus();
            }}
          >
            <IconBase name="close" />
          </ButtonBase>
        )}
      </div>
    </TextField>
  );
};
