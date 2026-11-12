import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { z } from "zod";

// Adobe's Gregorian calendar constrains year zero to year one.
export const calendarDateSchema = z.iso.date().refine((value) => !value.startsWith("0000"), {
  message: "Use a year from 0001 to 9999",
});

/** Full calendar years within ±10 of the viewer's current local year, inclusive. */
export const calendarDateInputBounds = () => {
  const current = today(getLocalTimeZone());
  return {
    minValue: current.set({ year: current.year - 10, month: 1, day: 1 }),
    maxValue: current.set({ year: current.year + 10, month: 12, day: 31 }),
  };
};

/** Validate new field input without restricting stored historical dates. */
export const calendarDateInputSchema = calendarDateSchema.refine((value) => {
  const { minValue, maxValue } = calendarDateInputBounds();
  return value >= minValue.toString() && value <= maxValue.toString();
}, "Choose a year within 10 years of the current year.");

/** Format a Gregorian YYYY-MM-DD date without shifting it into the viewer's time zone. */
export const formatCalendarDate = (value: string, locale: string): string => {
  const date = parseDate(calendarDateSchema.parse(value));
  return new Intl.DateTimeFormat(locale, {
    calendar: "gregory",
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date.toDate("UTC"));
};

/** A validated date for calendar controls, with no time or timezone. */
export const parseCalendarDate = (value: string) => parseDate(calendarDateSchema.parse(value));
