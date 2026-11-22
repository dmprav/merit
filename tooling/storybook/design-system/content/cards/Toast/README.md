# Toast

A short notification that reports the outcome of something the person did when the screen does not already show it.

- Render `Toasts` once at the document root: the page's single toast region, a landmark named Notifications that F6 reaches. It centres over the page beside the application shell's sidebar and shows up to three toasts at a time; unmounting it discards them.
- Call `showToast({ tone, message, action?, onDismiss? })`. `tone` uses Notice's tones: `success` for a completed action, `danger` for a failure, plus `warning` and `neutral`. `message` is one short sentence, such as "Recommendation saved".
- `action` is one follow-up, such as Undo, Retry or Refresh; pressing it also dismisses the toast. `onDismiss` runs when the person closes it.
- A plain success leaves after four seconds. A toast with an action, or any other tone, stays until the person dismisses it or acts, so nobody has to catch a recovery in time.
- Keep failures of open input beside that input instead, and a page that cannot load in its place (`StateMessage`).
- `useEventToast(eventId, toast)` shows a toast each time a controller reports a new event, such as a save counter. Each event replaces the previous event's toast; the event present at mount is not shown again, and actionable toasts leave with their owner.
- `useToastWhile(toast)` keeps a toast up while a condition lasts, such as a failed refresh; it leaves when the toast becomes `null` or its owner unmounts.
- Appearance: `surface` card with `border`, `control-radius` and `popover-shadow`; the icon takes the tone colour (`success`, `warning`, `danger`; `muted` for neutral).

Exports: `showToast`, `useEventToast`, `useToastWhile`, `Toasts`, `ToastMessage`.
