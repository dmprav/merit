# ApplicationShell

The application frame: workspace identity, navigation and account in a sidebar (a drawer on narrow screens) beside the page, keeping the person's workspace and location clear.

## Usage

- `ApplicationShell`: supply `brand`, `identity`, `navigation` (real links; mark the current one `aria-current="page"`), `footer`, optional `utility`, and translated `navigationLabel`, `contextLabel`, `skipLabel`, `openNavigationLabel`, `closeNavigationLabel`. It owns the responsive drawer and its focus.
- `ApplicationContext` shows the workspace (`name`, `label`); pass real links containing `ApplicationContextOption` to make it a switcher, marking the current one with `aria-current`. A single workspace stays static. `ApplicationContextLinks` holds context links outside the switcher.
- `ApplicationNavigationButton` places a command such as Search with an optional `shortcut` hint (also set `aria-keyshortcuts`); call `useCloseNavigation` first when it opens something over the page. `ApplicationNavigationGroup` separates later destinations, with an optional `label`.
- `ApplicationNavigationList` and `ApplicationNavigationRow` (from `application-navigation`) give a link a secondary `action` and pointer reordering: supply stable `reorderKey`s, handle `onMove(id, target, position)`, and provide an accessible reorder menu for keyboard and touch. Use `appearance="popup"` in a `PopoverDialog`.
- `ApplicationAccount` keeps identity stable while loading (`name: null` shows `loadingLabel`); only real sessions pass `signOut`.
- `ApplicationDocumentationLink` opens documentation in a new tab; `newTabLabel` announces that.
- `ApplicationPage` provides the main landmark, breadcrumbs (`breadcrumb`, `breadcrumbLabel`, optional `breadcrumbAction` for personal actions such as pinning), gutters and `width`; pass `locationKey` so navigation focuses main. Use `contained` for viewport-bound panes.
- `ApplicationRecovery` replaces the frame when no workspace is usable; `ApplicationStandalonePage` frames sign-in or invitations; `ApplicationStage` gives previews the scrolling frame without navigation.
- The sidebar uses `surface-muted` with a `border` edge; the current item uses `action-subtle`; touch rows keep `target-touch`.

## Exports

- application-shell: `ApplicationShell`, `ApplicationContext`, `ApplicationContextOption`, `ApplicationContextLinks`, `ApplicationNavigationGroup`, `ApplicationNavigationButton`, `ApplicationDocumentationLink`, `ApplicationAccount`, `ApplicationPage`, `ApplicationRecovery`, `ApplicationStandalonePage`, `ApplicationStage`, `useCloseNavigation`
- application-navigation: `ApplicationNavigationList`, `ApplicationNavigationRow`
