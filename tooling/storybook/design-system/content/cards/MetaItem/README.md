# MetaItem

One quiet fact beside a title or in a metadata row, such as the date a response is due.

- Pass `icon` (a decorative 16px `Icon` name such as `calendar` or `clock`) and the fact as `children`. The text is muted, in `text-detail`, with one `meta-gap` between icon and text.
- Show dates with `CalendarDate` (or `Timestamp`) inside it so the value keeps its machine-readable form. Where icon and value make the fact plain to sighted readers, add `VisuallyHidden` text such as "Response requested by" for assistive technology.
- Dates, times and other metadata read this way; they are not badges. Use `Badge` only for a status, `Attribution` for who recorded something (it shares MetaItem's muted style and gap), and `Toggletip` for an explanation behind an info icon.
- Leave the item out entirely when there is no value, rather than showing a placeholder.

Exports: `MetaItem`.
