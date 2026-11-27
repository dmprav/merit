# Link

A destination: a native anchor, or a router link through the router's adapter (such as TanStack Router's `createLink`).

- Use `Link` for destinations and `Button` for commands. Links share Button's hover, press, and focus treatments.
- Supply `href` and `children`. Router adapters supply navigation and preloading through `onClick`, `onFocus`, `onMouseEnter`, and `onTouchStart`.
- Choose a `variant`:
  - `inline` (default) underlines a destination within prose, in `action` (hover `action-hover`).
  - `standalone` adds a control-sized target (`target-touch`) for a separate destination, with optional leading or trailing `Icon`.
  - `row` makes a whole list row the destination, with its title and supporting lines stacked; the list separates its rows.
  - `primary`, `secondary`, and `quiet` match adjacent buttons.
- `size` applies to button-shaped links only: `small` for compact labels, `large` for prominent site entry points.
- Keep labels specific to their destination ("View supporting evidence", not "Click here").
- When a link opens a new tab (`target="_blank"`, `rel="noopener noreferrer"`), announce it, for example with `aria-label="Applicant website (opens in a new tab)"`.
- Use `aria-current` to mark the current page in a set of links.
- A quiet link takes `alignment="start"` to line its content up with surrounding text, as Button does.

Exports: `Link`.
