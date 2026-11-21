# Merit's shared interface

Use `@merit/ui` for the visual language, controls, and recurring interaction and
presentation patterns shared across Merit. Start with the
[Storybook overview](src/overview.mdx) to choose controls and patterns, or run
`vp run storybook` to try their states. The [UI development guide](../../docs/guides/ui.md)
connects them to feature work and verification.

## Choose an owner

| Area                              | Owns                                                                       | Examples                                                     |
| --------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/foundations`                 | Shared design values and conventions, themes, and document defaults.       | Color, typography, spacing, density, motion, focus.          |
| `src/components`                  | Building blocks with bounded presentation and interaction contracts.       | Button, fields, dialog, layout primitives.                   |
| `src/patterns`                    | Recurring interaction and presentation conventions across Merit.           | Editing, confirmation, identity, feedback, page composition. |
| Capability and interface features | Business behavior, page assembly, and arrangements specific to their work. | Recommendation drafts, application history, team management. |

Choose by responsibility and what would make it change. `Stack`, `Inline`, and
`Reading` are layout building blocks; page framing is a pattern; a particular
comparison's columns and scrolling belong to its feature. A dialog supplies a
container; confirmation adds the presentation of a consequential action and its
pending and failure states. Implementation size and composing another component
do not determine the category.

Components remain independent of patterns. Patterns can compose components and
other patterns. Stories and documentation can demonstrate these responsibilities
together. A pattern can be guidance and executable examples without a shared
React component: extract code when repeated behavior needs a common owner.

The [project foundations](../../docs/foundations/README.md) establish direction,
experience commitments, and architecture. The [design language guide](src/foundations/foundations.mdx)
shows how emphasis, layout, and interaction cues express those commitments.
Patterns apply it to recurring situations; [workflows](../../docs/workflows/README.md)
and their features own business rules and outcomes.

## Keep contracts and explanations together

Each named module keeps its implementation, CSS Modules, stories, tests, and
specific guidance together. MDX explains selection and composition, API comments
define caller obligations, and stories show executable states. Keep each detailed
explanation with the responsibility that would make it change; use links from
related topics and the [overview](src/overview.mdx).

Within `src/components/fields`, text fields, date fields, and selects have their
own directories. Shared labels and feedback live in `field-parts.tsx` and
`field.module.css`; text and date fields share `input.module.css`.
[Field guidance](src/components/fields/fields.mdx) explains their common conventions.
The [editing pattern](src/patterns/editing/editing.mdx) owns commitment and draft
behavior across the property editors it groups.

Feature stories stay beside the feature. Storybook's categories describe reader
needs across packages: `@merit/tables` contributes a component and `@merit/forms`
contributes form patterns. Their implementation stays with those packages.

## Import and style

Import through named exports such as `@merit/ui/button` and `@merit/ui/layout`.
The [export map](package.json) keeps consumer imports independent of internal
folders. Modules within this package use relative imports.

Application and Storybook import `@merit/ui/styles.css` once. This
[entry point](src/styles.css) loads tokens, browser reset, and document defaults
in order. Tokens own shared values and theme overrides; document defaults apply
typography, colors, and focus fallbacks. Component and feature rules stay in their
CSS Modules, using semantic variables from [tokens.css](src/foundations/tokens.css).

Shared components own their styling, placement within themselves, interaction
states, and accessibility. Public components accept no `className` or `style`, and
expose explicit props rather than arbitrary DOM attributes. Components built on
React Aria pick the library props they support, keeping its naming, such as
`onPress` and `isDisabled`, without passing its whole prop types through. Render
and slot overrides, tab-order and visibility overrides, unstable props, and raw
pointer events stay inside this package, so press, focus, and dismissal behave
the same everywhere and library upgrades do not change feature APIs. `Link`
accepts the click, hover, and touch handlers a router adapter needs. Features place a
component through layout primitives or their own wrapping element, and choose
its presentation from the supported variations. When features repeatedly need a
presentation, add it to the shared owner so it stays consistent across Merit.
The [public contract test](src/public-contract.test.tsx) checks every export.

Feature CSS Modules arrange the feature's content and leave appearance to this
package: headings, labelled facts, attribution, and status have their own
components; `Text` supplies the few remaining text roles, and `VisuallyHidden`
keeps content for assistive technology. The [stylelint configuration](../../stylelint.config.mjs)
enforces that boundary for product and admin features.

Modules inside this package compose each other through unexported bases, such as
`button-base.tsx` and `icon-base.tsx`, which accept a pattern's `className`. The
export map keeps those bases internal.

Follow [Storybook authoring](../../docs/guides/storybook.md) for examples and
[UI verification](../../docs/guides/ui-verification.md) for interaction and visual checks.
When moving guidance or renaming stories, update documentation links, Storybook URLs,
and their browser tests together; preserve visual baselines when presentation is unchanged.
