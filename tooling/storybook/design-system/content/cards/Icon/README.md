# Icon

An interface symbol from Merit's named Lucide set, used to reinforce a label.

- Pass `name`, one of the `IconName`s shown in the preview: success, attention, failure, assistant, clock, info, pin, pinned, settings, add, discard, menu, sort, people, addressBook, ascending, descending, guide, more, home, layers, document, activity, calendar, left, right, down, check, arrow, forward, edit, copy, loading, exit, reset, close, send, stop, chat, search, filter. Names say what the glyph draws, never a Merit concept (`calendar`, `document`, `people`, `addressBook`, not round, application, team, contacts).
- Glyphs share a 16px size, 1.75 stroke width and the surrounding text colour. `pinned` uses a lighter 1.25 stroke and a filled, `muted` glyph to keep its saved state quiet.
- The control or layout around an icon places it; never resize or recolour an icon.
- Icons are hidden from assistive technology. Give icon-only controls an accessible name from the message catalogs and a target larger than the glyph (`target-touch`).
- `toneIcons` maps each tone to its one icon: info and neutral use `info`, success `success`, warning `attention` (triangle) and danger `failure` (circle-x). Badge, Notice, Toast and Toggletip all draw from it.
- Express status meaning in text as well; an icon never carries meaning on its own.
- Extend the explicitly imported set when a new symbol is needed rather than importing glyphs in features.

Exports: `Icon`, `toneIcons`.
