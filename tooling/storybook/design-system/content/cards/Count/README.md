# Count

How many items a tab, section heading or disclosure holds, in one small chip: caption size, tabular numerals, `surface-muted` background, `badge-radius`.

- Put it after the label and a space, so label and number stay separate words in the accessible name.
- `tone="warning"` is for a count that needs attention; explain why in `title` and in text, since hover is not available everywhere.
- `Tabs` (`count`), `SectionHeader` (`count`) and `Disclosure` (`count`) draw this chip themselves; use `Count` directly only beside a control or label that has no such option.
- A status such as "Draft" is a `Badge`; other metadata is a `MetaItem`.

Exports: `Count`.
