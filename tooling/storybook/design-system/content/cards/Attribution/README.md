# Attribution

A muted caption line saying who recorded something, through which interface, and when — use it under recorded events, summaries and history entries.

## Usage

- Supply `actor` as the person's name; pass `null` when the name was not recorded and the line reads "Recorded by Name not recorded".
- Supply `provenance` (an `ActionProvenanceValue` or `null`) only where the record keeps the interface; beside the actor, only an MCP client is named.
- Supply `recordedAt` as an instant (ISO string); it is shown through `Timestamp` in the viewer's local time.
- Omit `provenance` or `recordedAt` where the record does not keep them; do not invent placeholders.
- Text is `text-caption` in `muted`, with parts spaced by `space-3` and wrapping on narrow widths.
- Each `TimelineEntry` takes an Attribution; use it there rather than composing names and dates by hand.
- Use `ActionProvenance` with `detail` instead when the interface is the record's own field.

## Exports

- `Attribution` — props `actor: string | null`, `provenance?: ActionProvenanceValue | null`, `recordedAt?: string`
