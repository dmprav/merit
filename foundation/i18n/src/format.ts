import { formatCalendarDate } from "@merit/dates";
import { formatMoney, type Money } from "@merit/money";

import { useLocaleSettings } from "./index";

export const useFormat = () => {
  const { formatLocale } = useLocaleSettings();
  return {
    money: (value: Money | null) => (value === null ? "—" : formatMoney(value, formatLocale)),
    calendarDate: (value: string | null) =>
      value === null ? "—" : formatCalendarDate(value, formatLocale),
  };
};
