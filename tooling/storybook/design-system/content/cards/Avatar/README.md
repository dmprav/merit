# Avatar

Decorative initials for a person, or a dashed outline when no person is selected; pair it with the person's visible name.

- Pass `name`; the avatar shows the first letter of up to two words, upper-cased ("Dana Reed" → DR, "Dana" → D).
- Omit `name` for an unassigned slot: the avatar draws a dashed `border-control` outline.
- `size` is `compact` (default, `avatar-compact-size`) or `regular` (`avatar-regular-size`).
- Initials sit on `action-subtle` in the `action` colour.
- The avatar is `aria-hidden`: always place the person's name as visible text beside it. Prefer the `PersonIdentity` pattern, which composes the two.
- It is not interactive and carries no status; put actions and states on the surrounding row.

Exports: `Avatar`.
