# OutcomeSummary

A presentational line pairing a stated position, such as "Recommends funding", with a secondary detail such as the proposed amount.

## Usage

- Supply `title` as the stated position; it renders in strong `text-body` weight.
- Supply `detail` for the secondary fact (an amount, "No funding proposed"); it renders `muted` with tabular numerals.
- The feature owns the wording: compose the title and detail from its own messages, including the "not stated" cases, and format money before passing it.
- Keep it presentational — it holds no state and no actions. Use `Judgment` when the author, date, basis and reasoning belong with the position.
- Title and detail wrap onto separate lines when space runs out, separated by `space-2`/`space-3`.

## Exports

- `OutcomeSummary` — props `title: string`, `detail?: string`
