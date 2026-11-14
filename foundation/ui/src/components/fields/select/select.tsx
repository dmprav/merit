import { useId, useState } from "react";
import {
  Select as AriaSelect,
  SelectValue,
  Button,
  Popover,
  ListBox,
  ListBoxItem,
  type SelectProps as AriaSelectProps,
} from "react-aria-components/Select";

import { Button as ActionButton } from "../../button/button";
import { Icon } from "../../icon/icon";
import { FieldLabel, FieldFeedback, type FieldPresentationProps } from "../field-parts";
import fieldStyles from "../field.module.css";
import styles from "./select.module.css";

export type SelectProps<Id extends string> = Pick<
  AriaSelectProps,
  | "name"
  | "onBlur"
  | "autoFocus"
  | "isDisabled"
  | "isRequired"
  | "isInvalid"
  | "validationBehavior"
  | "placeholder"
> &
  FieldPresentationProps & {
    items: readonly { id: Id; label: string; description?: string; isDisabled?: boolean }[];
    selectedKey?: Id | null;
    defaultSelectedKey?: Id;
    onSelectionChange?: (id: Id) => void;
    actions?: readonly { id: string; label: string; onAction: () => void }[];
  };

export const Select = <Id extends string>({
  label,
  description,
  errorMessage,
  items,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  actions,
  ...props
}: SelectProps<Id>) => {
  const descriptionId = useId();
  // The select trigger is a button, so expose its requirement as a description.
  const requiredId = useId();
  const showRequired = props.isRequired && !props.isDisabled;
  const [open, setOpen] = useState(false);

  return (
    <AriaSelect
      {...props}
      isOpen={open}
      onOpenChange={setOpen}
      aria-describedby={
        [showRequired ? requiredId : undefined, description ? descriptionId : undefined]
          .filter(Boolean)
          .join(" ") || undefined
      }
      selectedKey={selectedKey}
      defaultSelectedKey={defaultSelectedKey}
      onSelectionChange={(key) => {
        const item = items.find((item) => item.id === key);
        if (item) {
          onSelectionChange?.(item.id);
        }
      }}
      className={`${fieldStyles.field} ${styles.select}`}
    >
      {({ isInvalid }) => (
        <>
          <FieldLabel required={showRequired} requiredId={requiredId}>
            {label}
          </FieldLabel>
          <Button data-invalid-focus-target={isInvalid || undefined} className={styles.trigger}>
            <SelectValue className={styles.value}>
              {({ selectedText, isPlaceholder, defaultChildren }) =>
                isPlaceholder ? defaultChildren : selectedText
              }
            </SelectValue>
            <Icon name="down" className={styles.indicator} />
          </Button>
          <Popover className={styles.popover} offset={4}>
            <ListBox className={styles.list}>
              {items.map((item) => (
                <ListBoxItem
                  key={item.id}
                  id={item.id}
                  textValue={item.label}
                  isDisabled={item.isDisabled || props.isDisabled}
                  className={styles.option}
                >
                  {({ isSelected }) => (
                    <SelectOptionContent
                      label={item.label}
                      description={item.description}
                      isSelected={isSelected}
                    />
                  )}
                </ListBoxItem>
              ))}
            </ListBox>
            {actions && actions.length > 0 && (
              <div className={styles.actions}>
                {actions.map((action) => (
                  <ActionButton
                    key={action.id}
                    size="small"
                    variant="quiet"
                    className={styles.action}
                    isDisabled={props.isDisabled}
                    onPress={() => {
                      setOpen(false);
                      action.onAction();
                    }}
                  >
                    {action.label}
                  </ActionButton>
                ))}
              </div>
            )}
          </Popover>
          <FieldFeedback
            description={description}
            descriptionId={descriptionId}
            errorMessage={errorMessage}
          />
        </>
      )}
    </AriaSelect>
  );
};

const SelectOptionContent = ({
  label,
  description,
  isSelected,
}: {
  label: string;
  description?: string;
  isSelected: boolean;
}) => (
  <>
    <span className={styles.optionCopy}>
      <span>{label}</span>
      {description && (
        <>
          {" "}
          <span className={styles.optionDescription}>{description}</span>
        </>
      )}
    </span>
    <span className={styles.check}>{isSelected && <Icon name="check" />}</span>
  </>
);
