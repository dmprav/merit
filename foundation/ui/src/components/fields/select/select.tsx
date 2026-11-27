import { useId, useState } from "react";
import { Button as RowButton } from "react-aria-components/Button";
import {
  Select as AriaSelect,
  SelectValue,
  Button,
  Popover,
  ListBox,
  ListBoxItem,
  type SelectProps as AriaSelectProps,
} from "react-aria-components/Select";

import rowStyles from "../../../foundations/list-row.module.css";
import { popoverOffset, popoverScroller, popoverSurface } from "../../../foundations/popover";
import scrollStyles from "../../../foundations/scroll-area.module.css";
import { IconBase, type IconName } from "../../icon/icon-base";
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
    appearance?: "field" | "criterion";
    items: readonly { id: Id; label: string; description?: string; isDisabled?: boolean }[];
    selectedKey?: Id | null;
    defaultSelectedKey?: Id;
    onSelectionChange?: (id: Id) => void;
    /** Related commands below the options, such as adding a missing choice. */
    /** Commands beside the options, such as adding one; the icon sets them apart at a glance. */
    actions?: readonly { id: string; label: string; icon: IconName; onAction: () => void }[];
  };

/**
 * Use Select to choose a field value; the owning form or editing pattern determines when that value
 * is saved. Give unfamiliar options a short description so people can compare meanings before
 * selecting; the closed control retains just the label. Options use the shared list row: the
 * selected one shows a checkmark and keyboard focus the shared side marker. Long menus scroll with
 * related actions, each with a leading icon, in a separate footer. Use real links for destinations and ActionMenu for commands. See
 * [control selection](?path=/docs/overview--docs#choose-controls-by-outcome) for the related
 * patterns.
 */
export const Select = <Id extends string>({
  label,
  isLabelHidden,
  description,
  errorMessage,
  items,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  actions,
  appearance = "field",
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
      data-appearance={appearance}
    >
      {({ isInvalid }) => (
        <>
          <FieldLabel required={showRequired} requiredId={requiredId} isHidden={isLabelHidden}>
            {label}
          </FieldLabel>
          <SelectTrigger label={label} appearance={appearance} isInvalid={isInvalid} />
          <Popover className={`${popoverSurface} ${styles.popover}`} offset={popoverOffset}>
            <ListBox className={popoverScroller}>
              {items.map((item) => (
                <ListBoxItem
                  key={item.id}
                  id={item.id}
                  textValue={item.label}
                  isDisabled={item.isDisabled || props.isDisabled}
                  className={rowStyles.row}
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
              <div className={`${rowStyles.actionGroup} ${scrollStyles.dividerUntilEnd}`}>
                {actions.map((action) => (
                  // Opt out of the select's trigger context; this is a separate command.
                  <RowButton
                    key={action.id}
                    slot={null}
                    className={rowStyles.row}
                    isDisabled={props.isDisabled}
                    onPress={() => {
                      setOpen(false);
                      action.onAction();
                    }}
                  >
                    <span className={rowStyles.leading}>
                      <IconBase name={action.icon} />
                    </span>
                    <span className={rowStyles.copy}>{action.label}</span>
                  </RowButton>
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

const SelectTrigger = ({
  label,
  appearance,
  isInvalid,
}: {
  label: string;
  appearance: "field" | "criterion";
  isInvalid: boolean;
}) => {
  const criterionId = useId();
  return (
    <Button
      data-invalid-focus-target={isInvalid || undefined}
      className={styles.trigger}
      aria-labelledby={
        appearance === "criterion" ? `${criterionId}-label ${criterionId}-value` : undefined
      }
    >
      {appearance === "criterion" && (
        <span className={styles.criterionLabel} id={`${criterionId}-label`}>
          {label}{" "}
        </span>
      )}
      <SelectValue
        className={styles.value}
        id={appearance === "criterion" ? `${criterionId}-value` : undefined}
      >
        {({ selectedText, isPlaceholder, defaultChildren }) =>
          isPlaceholder ? defaultChildren : selectedText
        }
      </SelectValue>
      <IconBase name="down" className={styles.indicator} />
    </Button>
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
    <span className={rowStyles.copy}>
      <span>{label}</span>
      {description && (
        <>
          {" "}
          <span className={rowStyles.description}>{description}</span>
        </>
      )}
    </span>
    <span className={rowStyles.trailing}>{isSelected && <IconBase name="check" />}</span>
  </>
);
