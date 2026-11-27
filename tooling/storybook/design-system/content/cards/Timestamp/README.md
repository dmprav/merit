# Timestamp

A local timestamp that keeps its machine-readable instant, for when something was submitted, edited or decided.

- Supply `value` as an ISO instant, such as "2027-01-20T12:00:45Z".
- It renders a `time` element with `dateTime` set to the instant and text formatted in the viewer's locale and time zone (en-GB under `Provider`, for example "20 Jan 2027, 12:00").
- It inherits the surrounding typography and wraps when space is short.
- Use `Attribution` when the record also names who recorded it and through which interface.

- `CalendarDate` is the same for a calendar date such as a due date, response-by or submitted-on: pass `value` as "2027-02-14" and it renders a `time` element with `dateTime` set to it and the date formatted for the viewer's locale. Use it where a date is metadata; leave a date inside a sentence as text.

Exports: `Timestamp`, `CalendarDate`.
