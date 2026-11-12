import { useState } from "react";

import { calendarDateInputSchema, calendarDateSchema } from "@merit/dates";

import { Button } from "../../components/button/button";
import { Calendar } from "../../components/calendar/calendar";
import { DateField } from "../../components/fields/date-field/date-field";
import { Icon } from "../../components/icon/icon";
import { Tooltip } from "../../components/tooltip/tooltip";
import styles from "./date-choice.module.css";

type DateChoiceProps = {
  value: string | null;
  label: string;
  clearLabel: string;
  applyLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  invalidMessage: string;
  onChoose: (value: string | null) => void;
  isDisabled?: boolean;
};

export const DateChoice = ({
  value,
  label,
  clearLabel,
  applyLabel,
  cancelLabel,
  onCancel,
  invalidMessage,
  onChoose,
  isDisabled = false,
}: DateChoiceProps) => {
  const [typed, setTyped] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  const choose = (date: string | null) => {
    setTyped(date ?? "");
    setError(null);
    onChoose(date);
  };

  const apply = () => {
    if (typed && !calendarDateInputSchema.safeParse(typed).success) {
      setError(invalidMessage);
      return;
    }
    choose(typed || null);
  };

  return (
    <div className={styles.picker}>
      <DateField
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing || isDisabled) {
            return;
          }
          event.preventDefault();
          apply();
        }}
        label={label}
        value={typed}
        onChange={(value) => {
          setTyped(value);
          setError(null);
        }}
        showCalendar={false}
        autoFocus
        isDisabled={isDisabled}
        isInvalid={Boolean(error)}
        errorMessage={error}
        actions={
          <>
            <Tooltip content={cancelLabel}>
              <Button
                size="small"
                variant="quiet"
                iconOnly
                aria-label={cancelLabel}
                isDisabled={isDisabled}
                onPress={onCancel}
              >
                <Icon name="close" />
              </Button>
            </Tooltip>
            <Tooltip content={applyLabel}>
              <Button
                size="small"
                variant="quiet"
                iconOnly
                aria-label={applyLabel}
                isDisabled={isDisabled}
                onPress={apply}
              >
                <Icon name="check" />
              </Button>
            </Tooltip>
          </>
        }
      />
      <Calendar
        label={label}
        value={calendarDateSchema.safeParse(typed).success ? typed : null}
        onChange={choose}
        isDisabled={isDisabled}
      />
      <Button
        size="small"
        variant="quiet"
        isDisabled={isDisabled || (!value && !typed)}
        onPress={() => choose(null)}
      >
        {clearLabel}
      </Button>
    </div>
  );
};
