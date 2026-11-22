# Develop and document states in Storybook

Use the [Storybook Overview](../../foundation/ui/src/overview.mdx) to find a
shared pattern or inspect a feature. When contributing an example, decide what
a reader should be able to see, try, or choose.

## Develop states in Storybook

- **Write a story for an observable state or interaction.** Use the real component
  with realistic content. Someone should be able to try a choice, inspect its
  effect, or see what recovery looks like. Compare simple visual variants in one
  example. Give an interaction its own story when reaching that state matters,
  as in [resuming a recommendation](../../capabilities/grantmaking/web/src/views/recommendations/recommendation-editor.stories.tsx).
- **Use Autodocs for the public component API.** Set the suite's `component` to
  the exported control and `subcomponents` to related exports. Keep caller
  obligations beside the implementation in JSDoc. Put controlled state in
  `render` so the example shows how a caller uses the control. A suite about
  a composition can use a scenario harness.
- **Write colocated MDX when the reader has a choice to make.** Explain when to
  use a treatment, what would change that choice, and show it with existing
  stories. For example, [Team](../../interfaces/product/src/features/team/team-design.mdx)
  shows why revoking invitations has different emphasis during an access edit
  and a removal. Use `Canvas` for live examples and `Description` and `ArgTypes`
  for generated contracts. A pattern can be useful guidance without needing a
  new shared component.

Use `tags: ["!autodocs"]` for feature suites and when attached MDX replaces a
component's generated page. Readers can open a feature story in its intended
state. Embed a small set of feature examples in separate frames when a comparison
needs explanation. The [documentation guide](documentation.md#give-knowledge-a-clear-home)
explains where workflows, API contracts, and customer instructions belong.

## Place the example where people look for it

Keep `*.stories.tsx` and authored MDX beside the component or feature.
Alongside the Overview, the [Design language guide](../../foundation/ui/src/foundations/foundations.mdx)
explains shared choices about emphasis, reading, layout, and interaction cues.
Organize other examples by the responsibility a reader is looking for.

| Group        | What belongs there                                                      |
| ------------ | ----------------------------------------------------------------------- |
| `Overview`   | Entry points into grant work and guidance for choosing controls.        |
| `Components` | Reusable controls and layout building blocks, including the data table. |
| `Patterns`   | Shared interactions and presentation, including page composition.       |
| `Features`   | Domain screens and tasks, grouped by the work people recognize.         |

Use `Components/Dialog` for the reusable container and
`Patterns/Confirmation dialog` for the consequential-action pattern, and
`Patterns/Form dialog` for compact forms and writing composers. These sidebar
groups describe responsibility across packages; keep story files beside their
implementations.

`Patterns/Page composition` brings page hierarchy and width choices together
with focused examples. `Components/Layout primitives` owns simple flows and reading
width; `Patterns/Application shell` owns navigation and framing. Guidance belongs
with the responsibility it explains. Patterns such as `Patterns/Feedback` can be
MDX pages that compose existing stories without introducing a shared component.
The [UI package guide](../../foundation/ui/README.md) explains these boundaries.

Group feature stories as `Features/<area>/<screen or task>` and name each
story for the state someone wants to inspect. For example,
`Features/Funding rounds/Manage round` contains **Concurrent edits**. Use
separate suites for creating and inspecting a record. The
[Storybook configuration](../../tooling/storybook/.storybook/main.ts) owns
the sidebar order. Export a representative usable state first.

Story titles determine their URLs. When changing a title, update links in MDX and
browser tests, and rename affected visual baselines to match the new story IDs.
Keep the existing baseline images when only navigation changes.

## Set up an inspectable state

Leave interactive examples in a state people can inspect and try. If an
interaction closes or removes the demonstrated UI, restore the example or cover
that behavior in a component test.

Keep synthetic navigation and test controls outside the product frame. Mark
fixtures that exercise unusual data. Match the real placement of an editor, or
show a bounded standalone form when its surrounding screen adds little.

Storybook runs without a database or credentials and loads the application styles.
Use the theme toolbar to inspect product and site palettes, and shared fictional
data where a story needs domain content. Fix dates and save outcomes so examples
are reproducible.

Connected feature stories use an app-local `StoryEnvironment` with a fresh query
cache and memory router for each mount. Server-function replacements are registered
in [the preview configuration](../../tooling/storybook/.storybook/preview.tsx) and
live in adjacent `__mocks__` files. These replacements keep server-only modules out
of the browser; configure their typed outcomes in each story's `beforeEach`.
Unconfigured calls fail explicitly. Mock transport and persistence at these boundaries,
while keeping feature controls, forms, and domain rules real. Keep story-specific
state isolated and avoid writing to browser storage. Account previews use a
fictional identity without Clerk. Demo lifecycle behavior is verified through the
persisted workspace integration and browser suites.

Configure successful outcomes for the actions offered by ordinary examples so
people can continue using them after their setup completes. Named pending,
failure, and conflict stories override those outcomes deliberately. Update local
fixtures after a successful mock write; keep this simulation separate from
business-rule verification.

Global preview configuration supplies styles and document-level theming, including
portals. Add translation, routing, and other providers in the feature's decorators.
Use `layout: "fullscreen"` for screens and shells; component examples default to
Storybook's padding. Frame `Features/*` stories with `ApplicationPage` or `AppPage`
using `breadcrumb={null}` unless the story demonstrates breadcrumbs, parent links,
or preserved route context. Keep the same width and header density as the
application when layout affects the task. Reserve workspace navigation for
`Patterns/Application shell` and `Features/Workspace` stories that demonstrate navigation, entry, or
recovery. For viewport-contained application work, use `ApplicationContainedPreview`
from grantmaking's testing fixture: it applies the shell scrolling contract with
`ApplicationPage contained` without navigation or breadcrumbs.
Avoid copying shell CSS classes or setting a separate preview height. Examples own their landmarks, so
shell stories must not acquire another `main`.

Expose Controls for args that actually change the example. Disable controls for
fixture data and state owned by the interactive example. Use `fn()` to make
callbacks observable when the interaction depends on them.

## Share the catalog outside the repository

The [design-system export](../../tooling/storybook/design-system/README.md) packages
the same shared catalog for designers and agents who work outside the repository:
tokens from `tokens.css`, the built library and a card for each component and pattern.
When a change adds a token, a shared export, or changes what a component shows, update
its classification or card there and rebuild with
`vp run @merit/storybook#build:design-system`.
