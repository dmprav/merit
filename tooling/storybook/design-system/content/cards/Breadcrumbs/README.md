# Breadcrumbs

A trail of meaningful parent destinations in hierarchy order, ending with the current page as plain text.

- Supply `label` (a translated navigation name, such as "Breadcrumb") and `items`: native or router links for parents, followed by a non-link current-page label.
- Breadcrumbs owns the navigation landmark, ordered list, decorative "/" separators, `aria-current="page"` and focus styling; features own destinations and preserved route context.
- Parent links are regular weight in `muted`; the current page uses `foreground`. Parent links share Tabs' neutral hover and tinted, underlined keyboard focus, with `target-touch` sized targets.
- Long labels wrap and stay readable.
- Keep tabs and editing states outside the trail. An empty trail renders nothing.
- `ApplicationPage` positions the component in its top bar.

Exports: `Breadcrumbs`.
