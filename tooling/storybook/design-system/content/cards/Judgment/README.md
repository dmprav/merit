# Judgment

Presents a person's judgment — a recommendation or assessment — with who made it and when, their position and amount, its basis, and supporting reasoning.

## Usage

- Supply `author` (shown with `PersonIdentity`) and optional `meta` for muted facts such as the date recorded.
- Supply `summary` with the position in `<strong>` followed by any amount as separate spans; omit it before a judgment exists — the author stays visible and the feature states the gap (for example `Text variant="missing"`).
- Supply `basis` only when it qualifies the position, such as an earlier submission version, as separate short spans.
- Put supporting content such as reasoning in `children`; it follows the summary.
- Put one control at the end of the author line with `action`, usually an icon-only quiet `Button` with an accessible label such as "Edit recommendation".
- Use `JudgmentChoice` to present the same summary as a quiet control that opens the full judgment; supply `onPress` (and `ref` to restore focus). Its name includes the author and summary, and a trailing chevron signals it opens.
- Use `OutcomeSummary` instead for a position without an author.
- Meta and basis use `text-caption`/`text-detail` in `muted`; parts are spaced with `space-1`–`space-3`.

## Exports

- `Judgment` — props `author`, `meta?`, `summary?`, `basis?`, `action?`, `children?`
- `JudgmentChoice` — props `author`, `meta?`, `summary?`, `basis?`, `onPress`, `ref?`
