# Button

The command control for actions people take on a page, from routine edits in dense work surfaces to a page's main action.

- Use `Button` for commands; use `Link` for destinations. `onPress` covers mouse, touch, and keyboard alike.
- Supply `children` (the label, optionally with an `Icon`). For an icon-only button set `iconOnly` and give it an `aria-label`.
- Choose a `variant`:
  - `primary` fills with `action` / `on-action` (hover `action-hover`) for the main action.
  - `secondary` sits on `surface` with a quieter `border-control` edge, for alternatives such as Cancel.
  - `quiet` is transparent; on hover or while `aria-expanded` it takes `--button-quiet-background` from its surface (default `surface-muted`).
  - `destructive` fills with `danger` / `on-danger` for removal and revocation.
  - `inline` presents a command within copy, such as opening a dialog, with the inline link's text treatment.
- `size` defaults to `small`, which suits most actions in Merit's dense surfaces; `medium` or `large` give a page's main action more weight.
- `alignment="start"` lines a quiet action's content up with surrounding text while keeping its padded target; `alignment="end"` does the same at the trailing edge, for the last action in a row (an icon-only button outdents so its glyph meets the edge). Section headers and panel sections apply it to their trailing quiet action automatically.
- `isPending` shows a spinner, keeps focus, and blocks presses; with `iconOnly` the spinner replaces the icon. `isDisabled` removes the button from focus and interaction; don't hang the only explanation of an unavailable action on a disabled button.
- Pass `aria-expanded`, `aria-pressed`, `aria-haspopup`, and `aria-controls` when the button drives a disclosure, toggle, or popup.
- Shape and rhythm: `control-radius`, `control-height-small` minimum height, `space-1`/`space-3` padding, `space-2` icon gap. Press and keyboard focus keep the shared control treatment, and focus takes precedence over hover.
- The surrounding layout places a button; Button exposes no class or style escape hatch.

Exports: `Button`.
