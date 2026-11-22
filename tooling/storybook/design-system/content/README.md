Merit is a workspace for grant work: seeing what needs attention, understanding evidence, and making deliberate decisions. Its interface is restrained and dense, in the spirit of Linear: neutral warm-grey grounds, one slate-blue action colour, three outcome colours, system type in a tight scale. Emphasis is spent only on the distinction that changes the person's next action.

## Principles

- **Give emphasis a reason.** Use wording, grouping and spacing to show how facts belong together. Reserve `action` for what can be acted on and `success` / `warning` / `danger` for outcomes. A manager's recommendation, a selected application and a successful save can share a screen, so each keeps its own cue.
- **Pair every colour with words.** A badge says "Funded", a notice says what failed. Colour never carries meaning alone.
- **Let density follow the activity.** Reading views get `reading` type at a 65-character measure; work lists get `detail` type and compact controls; editors keep context beside the field.
- **Keep focus visible without moving content.** A 2px `focus` outline at 2px offset; fields mark focus with a `focus` underline inside the edge; in forced-colours mode controls fall back to system outlines.
- **Explain at the point of need.** Labels and values first; inline text for consequences and recovery; tooltips only for icon-only controls.

## Content

- Sentence case everywhere: "Mark ready for review", never "Mark Ready For Review".
- Name an action with a verb and its object: **Create organization**, **Change recipient and send**, **Keep my changes**. Keep the words that distinguish scope or outcome.
- Start with the label and its value. Add inline copy only for a distinction or consequence they cannot carry; don't give every field a helper sentence.
- Write relationships out: "Committee on 12 November", "Submission v2". Use complete sentences for warnings, consequences and draft lifetimes.
- Reserve the middle dot (`·`) for short runs of equally secondary facts, like "12 November · v2", and for "Page · Merit" in browser tabs. Don't chain statuses or warnings with dots.
- Show missing information as missing ("Not provided"), in `muted`, rather than hiding the field.

## Colour

Two themes share every meaning. **Site** is the public site and guides; **Product** is the application, where `background` lifts to white and the outcome colours soften slightly.

- Ground: `background`; content and controls on `surface`; quiet fills on `surface-muted`.
- Text: `foreground` for content, `muted` for supporting text, captions and placeholders. Both pass 4.5:1 on all three grounds in both themes.
- Lines: `border` groups content; `border-control` outlines anything editable.
- Interaction: `action` fills primary buttons and colours links; `action-hover` on hover; `on-action` text on it. `action-subtle` marks keyboard focus on quiet controls and text selection.
- Outcomes: `success`, `warning`, `danger` as text or icon on their `-subtle` fill. `danger` also fills destructive buttons with `on-danger` text.
- The modal overlay is `foreground` at 30% (the source mixes it with `color-mix`, so it has no token here).

## Type

One family: Instrument Sans (the variable font, weights 400–700, files in `fonts/`), so Merit looks the same on every platform. Platform fonts (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`) are only the fallback while it loads. Let size and weight carry the hierarchy: emphasis is weight 500 or 600, never italics. Emails keep platform fonts, because mail clients don't load web fonts reliably.

- Pages: `kicker` (uppercase, `muted`) above `page`; `page-compact` in compact headers and below 600px. `section` for headings within a page. `display` only on the public site.
- Copy: `body` on the site. In the Product theme, interface copy, controls and labels drop to `detail` (13px): dense work reads in three steps, `caption` for metadata, `detail` for interface and copy, `reading` for prose.
- Use tabular numerals for amounts and counts.

## Space, shape and depth

- Spacing runs in 4px steps from `space-1` to `space-8`. Small gaps connect (`space-2` joins a source to its passage); larger gaps separate (`space-6` before a budget).
- Corners: `badge-radius` for badges, `control-radius` for controls and notices, `panel-radius` for panels and dialogs. Nothing is pill-shaped.
- Depth comes from borders, not shadows. Only floating layers cast one: `popover-shadow` for menus and popovers, `dialog-shadow` for dialogs.
- Controls are `control-height-small` (32px) tall by default and grow to `target-touch` (44px) on coarse pointers.

## Motion

Short fades only: 120ms for colour changes on controls, 160ms for overlays entering (ease-out) and leaving (ease-in). With reduced motion preferred, skip the transition entirely.

## Iconography

Lucide glyphs at 16px with a 1.75 stroke in the surrounding text colour; see the Icons group. Icons reinforce a label and never stand in for one, except in icon-only controls that carry an accessible name.

## Logo

The mark (Logos group) sits 1.2em tall beside the lowercase wordmark **merit** in the `wordmark` style, coloured `action`. The containing link owns the accessible name.

## Building with the components

The components are Merit's own React libraries (`@merit/ui`, `@merit/forms` and `@merit/tables`), built as one script. Every export sits on `window.Merit`; load React 19 and ReactDOM 19 from `components/lib/` first, then `components/bundle.js`, with `tokens.css` (which the design system generates from `tokens.json`) and `components/bundle.css`.

- Wrap every rendered tree in `Merit.Provider`, which supplies the shared English messages and en-GB date and number formatting.
- Set `data-theme="product"` on the root element inside the application and `site` (the default) on the public site and guides.
- Compose with `Stack`, `Inline` and `Reading` for layout; components take no `className` or `style`. Choose presentation through their props.
- Give a page header one labelled action; put further commands in an `ActionMenu`. Put a `Notice`'s controls in its `actions`, never in its message.
- Mount `Toasts` once per page when anything calls `showToast`.
- Build forms with `useForm` and the `Form*` fields so validation, pending state and conflict recovery behave as in the product; describe fields with `Merit.z`, the schema library the forms use.
- Show lists people compare and sort in a `DataTable`.

## Not synced

- `--overlay` (a `color-mix()` value), `--measure-reading: 65ch`, the fluid `--text-display`, the `--text-*` size variables and `--motion-fast` / `--motion-medium` stay in `components/bundle.css`, since tokens.json cannot hold them. The type styles above carry the same sizes.
