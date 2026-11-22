# Calendar

An always-visible month grid for choosing a Gregorian date within ten calendar years of the current year.

- Use `DateField` for ordinary date entry; use `Calendar` directly only when composing a picker that displays it separately, as `DateChoice` does with `DateField showCalendar={false}`.
- Supply `label`, `value` (a valid `YYYY-MM-DD` string or `null` for none) and `onChange`, which receives a valid date string on selection.
- Keyboard navigation alone moves focus but does not choose a date.
- `isDisabled` greys the grid and month navigation; `autoFocus` focuses the grid on mount; `headerActions` adds actions after the month navigation.
- Days and month navigation outside the permitted range are disabled.
- A filled `action` day is selected; a dot marks today; an underline and inset marker identify keyboard focus. Days use `control-radius`.
- At enlarged text sizes the day grid can scroll horizontally while month navigation stays visible.

Exports: `Calendar`.
