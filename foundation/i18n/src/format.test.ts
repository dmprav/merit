import { expect, it } from "vite-plus/test";

import { formatTimestamp } from "./format";

it("formats the same instant in the viewer's zone and chosen locale without seconds", () => {
  expect(formatTimestamp("2027-01-20T00:30:45Z", "en-GB", { timeZone: "America/New_York" })).toBe(
    "19 Jan 2027, 19:30",
  );
  expect(formatTimestamp("2027-01-20T00:30:45Z", "de-DE", { timeZone: "Europe/Berlin" })).toBe(
    "20. Jan. 2027, 01:30",
  );
});

it("converts instants across daylight-saving transitions and includes the full zone on request", () => {
  expect(formatTimestamp("2027-03-28T00:30:00Z", "en-GB", { timeZone: "Europe/Berlin" })).toBe(
    "28 Mar 2027, 01:30",
  );
  expect(formatTimestamp("2027-03-28T01:30:00Z", "en-GB", { timeZone: "Europe/Berlin" })).toBe(
    "28 Mar 2027, 03:30",
  );
  expect(
    formatTimestamp("2027-10-31T00:30:45Z", "en-GB", { timeZone: "Europe/Berlin", detail: "full" }),
  ).toBe("31 Oct 2027, 02:30:45 Central European Summer Time");
  expect(
    formatTimestamp("2027-10-31T01:30:45Z", "en-GB", { timeZone: "Europe/Berlin", detail: "full" }),
  ).toBe("31 Oct 2027, 02:30:45 Central European Standard Time");
});

it("uses the environment's time zone when no override is supplied", () => {
  const value = "2027-01-20T12:00:00Z";
  expect(formatTimestamp(value, "en-GB")).toBe(
    formatTimestamp(value, "en-GB", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  );
});
