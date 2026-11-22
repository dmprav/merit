# StatusMessage

A visually hidden live region that announces an update to assistive technology without showing it, such as a reordered list or a loaded demo.

- Supply `message` (a string, or `null` to clear the announcement) and `eventId`.
- Keep it mounted so the live region exists before a message arrives.
- Change `eventId` for each new event, even when its message is unchanged; keep its value stable between events.
- It renders `role="status"` with `aria-atomic`, so announcements are polite.
- Use `showToast` for a visible outcome, and `Notice` for persistent feedback beside the work.

Exports: `StatusMessage`.
