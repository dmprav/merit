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
experience commitments, and architecture. The [design foundations](src/foundations/foundations.mdx)
translate those commitments into a shared visual and interaction language.
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

Shared components own internal styling, interaction states, and accessibility.
A caller's `className` adjusts placement. Use supported variations and extend the
shared owner when a demonstrated presentation should remain consistent across
Merit. Features arrange controls and domain content.

Follow [Storybook authoring](../../docs/guides/storybook.md) for examples and
[UI verification](../../docs/guides/ui-verification.md) for interaction and visual checks.
When moving guidance or renaming stories, update documentation links, Storybook URLs,
and their browser tests together; preserve visual baselines when presentation is unchanged.
