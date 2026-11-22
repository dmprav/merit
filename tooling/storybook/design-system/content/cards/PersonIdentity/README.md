# PersonIdentity

A person's visible name with decorative initials, for property values, lists, attribution and account controls.

- Supply `name`; the name carries the accessible identity and the `Avatar` is decorative. Keep prose mentions and audit sentences as text, and workspace marks separate from people.
- Compact names use the `avatar-compact-size` avatar, a `space-2` gap and the surrounding typography. A `description` or a heading `nameAs` switches to the `avatar-regular-size` form.
- `description` is supporting phrasing content (text, spans, links, badges), such as an email, role or "4 November 2026 · Application v1"; it aligns under the name and the avatar centres beside both lines.
- `annotation` is a short identity qualifier beside the name, such as "You"; workflow status belongs outside the identity.
- `status` is a compact account qualifier, such as a plain `Badge` "Account disabled", when there is no dedicated account column; the caller owns its meaning and tone.
- `isPlaceholder` with a visible label such as "Unassigned" shows a dashed, unfilled avatar and muted name in the same slot, without presenting absence as a warning.
- `nameAs` (`span`, `h2`, `h3`) makes the name a heading when it introduces a section; names stay at regular body weight.
- Wrap it in a real `Link` for navigation. Put workflow status, dates and actions in their own cells or adjacent content; keep account menus and domain status logic with the feature.
- Long names wrap and rows grow; never override avatar dimensions locally.

Exports: `PersonIdentity`.
