# Icons

Merit uses [Lucide](https://lucide.dev) glyphs (lucide-static 1.70.0, the same release as the app's `lucide-react`), only the set below. Each file is named by the role the app gives it (`add` is Lucide's `plus`, `warning` is `circle-alert`, `discard` is `trash-2`).

- Size 16px, stroke width 1.75 with normal stroke scaling, round caps and joins, no fill.
- In the app the stroke is the surrounding text colour. These files bake in `foreground` (#292d29) so they render inside `<img>`; recolour the stroke when the icon sits on `muted`, `action` or an outcome colour.
- Icons reinforce a label and are hidden from assistive technology. An icon-only control needs an accessible name and a target of at least `target-touch` on coarse pointers. Status meaning is always written in words as well.
- `pin` in its saved state (the app's `pinned`) is filled, with a 1.25 stroke in `muted`.
