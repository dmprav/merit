# Develop and document states in Storybook

Use Storybook to make component and feature states inspectable without a database
or credentials. Follow [UI development](ui.md) when composing the interaction and
[UI verification](ui-verification.md) when checking it.

## Develop states in Storybook

Keep stories beside components as `*.stories.tsx`. Show the states a person can
encounter, including empty content, validation, pending actions, and failure where
relevant. Use real focus and interaction to demonstrate behavior. Feature stories
can compose the shared controls into realistic tasks; the
[recommendation editor stories](../../capabilities/grantmaking/web/src/views/recommendations/recommendation-editor.stories.tsx)
show editing and save recovery. The
[organization creation](../../interfaces/admin/src/features/organizations/create-organization.stories.tsx) and
[organization details](../../interfaces/admin/src/features/organizations/organization-details.stories.tsx)
stories cover provisioning, editing, and invitation recovery. The
[Team management](../../interfaces/product/src/features/team/team-view.stories.tsx),
[invitation acceptance](../../interfaces/product/src/features/workspace/views/invitation-view.stories.tsx),
[round management](../../interfaces/product/src/features/grantmaking/views/preparation/round-preparation.stories.tsx), and
[application management](../../interfaces/product/src/features/grantmaking/views/intake/application-intake.stories.tsx)
examples show the real feature controls in context, including consequential actions.
[Workspace recovery](../../interfaces/product/src/features/workspace/workspace.stories.tsx)
covers entry and recovery outside an editor. The demo uses those same screens;
its guide and lifecycle are checked in the application browser suite.

The [Team design guidance](../../interfaces/product/src/features/team/team-design.mdx)
curates accepted examples with their rationale: routine fields, an editor side
effect, a removal confirmation, and failure feedback. Use this form for settled
choices that future work should reuse. Link existing stories instead of copying
fixtures or preserving superseded alternatives. Mark synthetic boundary fixtures
as such so they do not imply a normal product workflow.

Give each story a distinct purpose: explain a choice, expose a meaningful state,
or protect an important interaction. Show simple visual variants together in a
comparison and use a configurable example for individual values. Keep focused
stories for keyboard behavior, pending actions, difficult content, and recovery.
Split suites by the task someone wants to inspect, rather than by story count.

The [contact editor](../../interfaces/product/src/features/contacts/contact-editor.stories.tsx)
and [contact picker](../../interfaces/product/src/features/contacts/contact-picker.stories.tsx)
make editing and selection discoverable beside the directory. The
[access request](../../interfaces/product/src/features/workspace/views/access-request.stories.tsx)
and [operator review](../../interfaces/admin/src/features/access-requests/access-requests.stories.tsx)
examples cover both sides of requesting workspace access.

Organize the sidebar by the responsibility a reader is looking for:

| Group         | What belongs there                                                      |
| ------------- | ----------------------------------------------------------------------- |
| `Overview`    | A starting point for choosing controls and finding their conventions.   |
| `Foundations` | Design tokens, typography, themes, and focus conventions.               |
| `Components`  | Reusable controls and layout building blocks, including the data table. |
| `Patterns`    | Shared interactions and presentation, including page composition.       |
| `Features`    | Domain screens and tasks, grouped by the work people recognize.         |

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

Group feature stories as `Features/<area>/<screen or task>`, with states as
individual stories. Use Funding rounds, Applications, Team, Contacts, Workspace,
Administration, or Demo as the area. For example,
`Features/Funding rounds/Manage round` contains **Concurrent edits**, while
`Features/Funding rounds/Preparation form` holds focused form examples. Keep
creation and detail screens in separate suites, even when they share a component.
The [preview configuration](../../tooling/storybook/.storybook/preview.tsx) orders
the groups and feature tasks, with shared suites ordered alphabetically. Keep the
task order aligned when adding a screen. Within each suite, export a representative
usable example first, followed by relevant variations and recovery states.

Story titles determine their URLs. When changing a title, update links in MDX and
browser tests, and rename affected visual baselines to match the new story IDs.
Keep the existing baseline images when only navigation changes.

Leave interactive examples in a state people can inspect and try. If an
interaction closes or removes the demonstrated UI, restore the example or cover
that behavior in a component test.

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
`Patterns/Application shell` and `Features/Workspace` stories that own entry or
recovery. For viewport-contained application work, use `ApplicationContainedPreview`
from grantmaking's testing fixture: it applies the shell scrolling contract with
`ApplicationPage contained` without navigation or breadcrumbs.
Avoid copying shell CSS classes or setting a separate preview height. Examples own their landmarks, so
shell stories must not acquire another `main`.

Expose Controls only when changing an arg updates the example. Disable controls
for initial fixture data and state owned by an interactive harness. Keep callbacks
observable with `fn()` where they are part of the demonstrated interaction.

Write component-selection and composition guidance in colocated MDX when it needs
an explanation. Embed existing stories with `Canvas` and generated contracts with
`Description` and `ArgTypes`; avoid copying JSX or prop tables. Set
`tags: ["!autodocs"]` on story metadata when an attached MDX page replaces Autodocs.
Also disable Autodocs for feature suites: rendering every starting screen in one
page obscures the states established by their interactions. Add a curated MDX
page only when it explains workflow distinctions, linking to individual stories
or embedding focused examples in separate frames. Simple controls can keep
Autodocs. See the [documentation guide](documentation.md)
for ownership across guides, API comments, and stories.
