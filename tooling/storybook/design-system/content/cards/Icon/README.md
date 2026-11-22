# Icon

An interface symbol from Merit's named Lucide set, used to reinforce a label.

- Pass `name`, one of the `IconName`s shown in the preview: warning, clock, info, pin, pinned, settings, add, discard, menu, sort, team, contacts, ascending, descending, guide, more, home, layers, application, activity, round, left, right, down, check, arrow, forward, edit, copy, loading, exit, reset, close, search, filter.
- Glyphs share a 16px size, 1.75 stroke width and the surrounding text colour. `pinned` uses a lighter 1.25 stroke and a filled, `muted` glyph to keep its saved state quiet.
- The control or layout around an icon places it; never resize or recolour an icon.
- Icons are hidden from assistive technology. Give icon-only controls an accessible name from the message catalogs and a target larger than the glyph (`target-touch`).
- Express status meaning in text as well; an icon never carries meaning on its own.
- Extend the explicitly imported set when a new symbol is needed rather than importing glyphs in features.

Exports: `Icon`.
