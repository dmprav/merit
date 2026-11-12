# Calendar dates

`@merit/dates` owns date validation and formatting for web, MCP, and business
modules. It uses `@internationalized/date` without depending on React or a database.

`calendarDateSchema` accepts real Gregorian dates as `YYYY-MM-DD` strings, with
years from `0001` through `9999`. It rejects timestamps, localized input, whitespace,
and year zero (which the underlying library would silently constrain to year one).
Parsing preserves the string, so database snapshots and API contracts stay JSON-safe.

For date fields, use `calendarDateInputSchema` before submitting. It also requires
the year to fall within ten years before or after the current year, including
both full boundary years. In 2026 this permits January 1, 2016 through December 31, 2036. `calendarDateInputBounds()` supplies the same `minValue` and `maxValue` for
calendars. Bounds are calculated when used, in the viewer's local time zone.
Keep `calendarDateSchema` for stored records and API contracts so historical dates
remain valid as time passes.

```ts
import { calendarDateSchema, formatCalendarDate } from "@merit/dates";

const meetingDate = calendarDateSchema.parse("2027-01-21");
formatCalendarDate(meetingDate, "en-GB"); // "21 January 2027"
```

`formatCalendarDate` validates its input and formats a long Gregorian date using
an explicit locale. UTC is used only as a formatting bridge; the date has no
business time zone and displays the same day everywhere. Invalid input throws.

Recorded event times, month-only periods, and zoned deadlines are distinct
concepts. Add their APIs when a workflow needs them; do not pass timestamps to the
calendar-date formatter or invent midnight for date-only history. Business rules
such as deadline enforcement belong to the capability that owns them.
