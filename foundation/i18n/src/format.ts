import { useSyncExternalStore } from "react";

import { formatCalendarDate } from "@merit/dates";
import { formatMoney, type Money } from "@merit/money";

import { useLocaleSettings } from "./index";

type TimestampOptions = { detail?: "compact" | "full"; timeZone?: string };

/** Format an instant in the viewer's zone; calendar-only values use calendarDate. */
export const formatTimestamp = (
  value: string,
  locale: string,
  { detail = "compact", timeZone }: TimestampOptions = {},
) =>
  new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(detail === "full" ? ({ second: "2-digit", timeZoneName: "long" } as const) : {}),
    timeZone,
  }).format(new Date(value));

const subscribeTimeZone = () => () => {};

const browserTimeZone = () => new Intl.DateTimeFormat().resolvedOptions().timeZone;

const serverTimeZone = () => "UTC";

export const useFormat = () => {
  const { formatLocale } = useLocaleSettings();
  // The first hydrated render must match SSR before adopting the browser's zone.
  const timeZone = useSyncExternalStore(subscribeTimeZone, browserTimeZone, serverTimeZone);
  return {
    money: (value: Money | null) => (value === null ? "—" : formatMoney(value, formatLocale)),
    calendarDate: (value: string | null) =>
      value === null ? "—" : formatCalendarDate(value, formatLocale),
    timestamp: (value: string, options?: TimestampOptions) =>
      formatTimestamp(value, formatLocale, { timeZone, ...options }),
  };
};
