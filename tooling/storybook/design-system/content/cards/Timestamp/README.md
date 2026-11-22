# Timestamp

A local timestamp that keeps its machine-readable instant, for when something was submitted, edited or decided.

- Supply `value` as an ISO instant, such as "2027-01-20T12:00:45Z".
- It renders a `time` element with `dateTime` set to the instant and text formatted in the viewer's locale and time zone (en-GB under `Provider`, for example "20 Jan 2027, 12:00").
- It inherits the surrounding typography and wraps when space is short.
- Use `Attribution` when the record also names who recorded it and through which interface.

Exports: `Timestamp`.
