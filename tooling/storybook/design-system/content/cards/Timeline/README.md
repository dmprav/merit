# Timeline

Recorded events in order, each beside a shared rail, such as an application's history.

- `Timeline` renders an ordered list; give it a `label` (for example "Application history"). Order the entries before rendering: the feature chooses the order.
- Each `TimelineEntry` has a `title`, an `attribution` (an `Attribution`: who recorded it, through which interface, and when) and optional `children` for any reason or change that follows.
- `headingLevel` (2–4, default 3) keeps entry titles in the document outline.
- `titleRef` lets a feature return focus to the entry after navigation within the page.
- Choose a table when people compare the same properties across records; use a timeline when the event and its context matter more.
- Page long histories with `PagedContent`.
- The rail and markers use `border` and `border-control` on `surface`; entries are spaced with `space-4`/`space-5`.

Exports: `Timeline`, `TimelineEntry`.
