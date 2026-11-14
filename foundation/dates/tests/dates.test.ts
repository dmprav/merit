import { describe, expect, it, vi, afterEach } from "vite-plus/test";

import {
  calendarDateInputBounds,
  calendarDateInputSchema,
  calendarDateSchema,
  formatCalendarDate,
  parseCalendarDate,
  todayCalendarDate,
} from "../src/index";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("date input range", () => {
  it.each([
    ["2015-12-31", false],
    ["2016-01-01", true],
    ["2016-02-29", true],
    ["2026-02-29", false],
    ["2036-12-31", true],
    ["2037-01-01", false],
    ["2026-02-", false],
    ["", false],
  ])("validates %s against the full surrounding years", (value, accepted) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 11, 12));

    expect(calendarDateInputSchema.safeParse(value).success).toBe(accepted);
  });

  it("updates the range at the new year without invalidating stored history", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 12));

    expect(calendarDateInputBounds().minValue.toString()).toBe("2016-01-01");
    expect(calendarDateInputBounds().maxValue.toString()).toBe("2036-12-31");

    vi.setSystemTime(new Date(2027, 0, 1, 12));

    expect(calendarDateInputBounds().minValue.toString()).toBe("2017-01-01");
    expect(calendarDateInputBounds().maxValue.toString()).toBe("2037-12-31");
    expect(calendarDateInputSchema.safeParse("2016-12-31").success).toBe(false);
    expect(calendarDateInputSchema.safeParse("2037-12-31").success).toBe(true);
    expect(calendarDateSchema.parse("2016-12-31")).toBe("2016-12-31");
    expect(formatCalendarDate("2016-12-31", "en-GB")).toBe("31 December 2016");
  });
});

describe("calendar dates", () => {
  it.each(["0001-01-01", "0099-12-31", "2000-02-29", "2024-02-29", "9999-12-31"])(
    "preserves the ISO string %s",
    (value) => expect(calendarDateSchema.parse(value)).toBe(value),
  );

  it.each([
    "0000-01-01",
    "1900-02-29",
    "2027-02-29",
    "2027-04-31",
    "2027-13-01",
    "2027-01-00",
    "2027-1-1",
    "21/01/2027",
    "2027-01-21T00:00:00Z",
    "2027-01-21T12:00:00+01:00",
    " 2027-01-21",
    "2027-01-21 ",
    "",
    "+010000-01-01",
  ])("rejects invalid or non-calendar input %j", (value) => {
    expect(calendarDateSchema.safeParse(value).success).toBe(false);
    expect(() => formatCalendarDate(value, "en-GB")).toThrow();
    expect(() => parseCalendarDate(value)).toThrow();
  });

  it.each([null, undefined, 20270121, new Date("2027-01-21")])(
    "rejects non-string input %j",
    (value) => {
      expect(calendarDateSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(["UTC", "America/Los_Angeles", "Europe/Berlin", "Pacific/Kiritimati"])(
    "preserves the day when the runtime zone is %s",
    (zone) => {
      vi.stubEnv("TZ", zone);

      expect(formatCalendarDate("2027-01-21", "en-GB")).toBe("21 January 2027");
      expect(formatCalendarDate("2024-02-29", "en-GB")).toBe("29 February 2024");
      expect(formatCalendarDate("0001-01-01", "en-GB")).toBe("1 January 1");
      expect(formatCalendarDate("0099-01-01", "en-GB")).toBe("1 January 99");
    },
  );

  it("uses the requested locale while preserving the Gregorian calendar", () => {
    expect(formatCalendarDate("2027-01-21", "de-DE")).toBe("21. Januar 2027");
    expect(formatCalendarDate("2027-01-21", "en-GB-u-ca-buddhist")).toBe("21 January 2027");
  });

  it.each(["0001-01-01", "2024-02-29", "9999-12-31"])(
    "provides the same Gregorian day to calendar controls: %s",
    (value) => {
      expect(parseCalendarDate(value).toString()).toBe(value);
    },
  );
});

it("reads today as the viewer's local calendar date", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 13, 23, 30));

  expect(todayCalendarDate()).toBe("2026-11-13");
});
