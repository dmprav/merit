import type { ReactNode } from "react";
import {
  Calendar as AriaCalendar,
  CalendarGrid,
  CalendarCell,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarGridBody,
} from "react-aria-components/Calendar";
import { Heading } from "react-aria-components/Heading";
import { useTranslation } from "react-i18next";

import { calendarDateInputBounds, parseCalendarDate } from "@merit/dates";

import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import styles from "./calendar.module.css";

/** Selects a Gregorian date within ±10 calendar years. Non-null values must be valid dates. */
export const Calendar = ({
  value,
  onChange,
  label,
  isDisabled = false,
  autoFocus = false,
  headerActions,
}: {
  value: string | null;
  onChange: (value: string) => void;
  label: string;
  isDisabled?: boolean;
  autoFocus?: boolean;
  /** Actions displayed after month navigation, such as a containing picker's close button. */
  headerActions?: ReactNode;
}) => {
  const { t } = useTranslation("common");

  return (
    <AriaCalendar
      aria-label={label}
      value={value ? parseCalendarDate(value) : null}
      {...calendarDateInputBounds()}
      onChange={(date) => onChange(date.toString())}
      isDisabled={isDisabled}
      autoFocus={autoFocus}
      className={styles.calendar}
    >
      <div className={styles.header}>
        <Heading className={styles.heading} />
        <div className={styles.navigation}>
          <Button
            slot="previous"
            variant="quiet"
            size="small"
            iconOnly
            aria-label={t("date.previousMonth")}
          >
            <Icon name="left" />
          </Button>
          <Button
            slot="next"
            variant="quiet"
            size="small"
            iconOnly
            aria-label={t("date.nextMonth")}
          >
            <Icon name="right" />
          </Button>
          {headerActions}
        </div>
      </div>
      <div className={styles.gridViewport}>
        <CalendarGrid className={styles.grid} weekdayStyle="short">
          <CalendarGridHeader>
            {(day) => <CalendarHeaderCell>{day.slice(0, 2)}</CalendarHeaderCell>}
          </CalendarGridHeader>
          <CalendarGridBody>
            {(date) => <CalendarCell date={date} className={styles.cell} />}
          </CalendarGridBody>
        </CalendarGrid>
      </div>
    </AriaCalendar>
  );
};
