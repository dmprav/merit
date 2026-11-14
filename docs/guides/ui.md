# Develop the interface

Develop a usable flow from the person's task through the result of their action.
Use the [experience principles](../foundations/experience.md) to guide design
choices and the relevant [workflow](../workflows/README.md) for people, rules,
and outcomes. Build the flow from Merit's shared controls, then check it in the
application. For writing and checking the result, use [interface copy](interface-copy.md),
[Storybook](storybook.md), and [UI verification](ui-verification.md).

## Work out the interaction

Trace how someone reaches the page, finds the information they need, acts on it,
and continues their work. Establish the source of displayed information and the
effect of each action before choosing controls. Record changes to agreed behavior
in the owning workflow.

Choose controls by the outcome of the interaction: following a destination,
selecting a value, running a command, editing, or confirming a consequence. The
design system's [control-selection guidance](../../foundation/ui/src/overview.mdx#choose-controls-by-outcome)
connects these tasks to shared components and their alternatives.

Choose the layout using representative content, including long text, missing
information, and the number of items people need to compare. Decide what remains
visible, what scrolls, and how supporting information stays accessible during an
action. Check that the arrangement works at narrow widths as well as on desktop.

## Review a representative slice

Translate feedback into the underlying problem before choosing a control. “Maybe
a tooltip” can mean that content is too long, repetitive, or poorly grouped.
Resolve the wording and hierarchy first, then decide whether another interaction
is needed. Use [contextual emphasis](../foundations/experience.md#give-emphasis-a-reason)
to distinguish an editing warning, a confirmation consequence, and a failure.

1. Choose the closest accepted screen and shared patterns. State which visual
   qualities and behavior should carry forward, and what this task requires to differ.
2. Develop a small representative slice: the ordinary view, a consequential action,
   and a failure or recovery state. Review realistic content at desktop and narrow
   widths before propagating the direction across the feature.
3. Preserve accepted decisions during iteration. Apply new feedback to its context;
   a request to quiet a removal dialog does not undo an accepted editor warning.
   Reopen a settled choice only when a concrete requirement or conflict warrants it,
   and explain that reason.
4. Once the direction is settled, apply it through the appropriate shared owner.
   Record the rationale beside the pattern and link to its live reference states.
   Describe when to use the treatment, rather than recording the conversation or
   treating one screenshot as a universal template.

Use focused visual checks while exploring. Run interaction and accessibility checks
for the affected behavior as the implementation settles, adding checks when a change
introduces a new risk. Reuse passing results while their inputs remain unchanged,
as required by the [verification guide](verification.md). The
[Team design guidance](../../interfaces/product/src/features/team/team-design.mdx)
is an example of preserving decisions with inspectable reference states.

## Compose and style a feature

Explore existing components in Storybook (`vp run storybook`, then
[localhost:6006](http://localhost:6006)). The [UI package guide](../../foundation/ui/README.md)
explains ownership, imports, and styling across foundations, components, and patterns.
Keep guidance with the responsibility it explains; feature stories stay with their feature.

Compose controls in the feature that owns the work. The recommendation editor
belongs in `capabilities/recommendations/web` because it understands recommendation
drafts and saving. Follow the [web feature guide](web-features.md) for its layers
and transport boundary. Its buttons and fields use shared components whose behavior and
presentation apply throughout Merit.

Shared controls own their appearance, interaction states, and accessibility,
including React Aria integration. Define their contracts in terms of behavior
callers need: focus, keyboard interaction, dismissal, validation, and pending
states. Apply the [platform responsibilities](../foundations/architecture.md#platform-and-component-responsibilities)
when changing an implementation, preserving those contracts as browser APIs and
libraries evolve. Feature styles arrange the controls and present domain content.
Use `DialogContent` inside `ModalDialog` for a shared scrolling body and persistent
footer; use `FormDialog` with `Form` for bounded editing. Their
[dialog guidance](../../foundation/ui/src/components/dialog/dialog.mdx) and
[form examples](../../foundation/forms/src/form/form-dialog.mdx) explain the compositions.
Use supported component variations; extend the shared component when a new
presentation should work consistently across Merit. A caller's `className` adjusts
placement, while the component owns its internal styling.
Add an option when it represents a demonstrated difference in the product's work.
Keep presentation choices that must agree inside the owning pattern, and remove
unused modes. Repeated feature overrides are a reason to improve that shared
presentation rather than make each caller maintain it.

Use colocated CSS Modules and semantic variables from
[the shared design tokens](../../foundation/ui/src/foundations/tokens.css) so feature styles follow the
product and site palettes. Storybook's
[foundations](../../foundation/ui/src/foundations/foundations.mdx),
[buttons](../../foundation/ui/src/components/button/button.stories.tsx), and
[icons](../../foundation/ui/src/components/icon/icon.stories.tsx) explain the visual conventions.
The [focus comparison](../../foundation/ui/src/foundations/focus.stories.tsx) brings buttons,
button-shaped links, and fields together to check their integrated focus cues
and state precedence. Use it when changing control focus styles; the foundations
documentation owns the convention.
Use native elements for static content and real links for navigation; the
[link examples](../../foundation/ui/src/components/link/link.stories.tsx) show the shared appearances.

Load the [shared stylesheet](../../foundation/ui/README.md#import-and-style) once
in the application or preview. Keep component and feature rules in their CSS Modules.

Use [layout primitives](../../foundation/ui/src/components/layout/layout.mdx) for
recurring flows and readable prose. Use the
[page composition pattern](../../foundation/ui/src/patterns/page-composition/page-composition.mdx)
for page width, heading hierarchy, and relationships between content and actions.
Use the [reference workspace](../../foundation/ui/src/patterns/reference-workspace/reference-workspace.mdx)
when work needs reference material beside it; features own other comparison
columns and scrolling.

### Design for different contexts

Make shared components respond to their available space and content. Use intrinsic
layout and container queries when the component's container determines the
arrangement; use viewport queries for page-level changes. Keep semantic reading
and keyboard order coherent as the layout changes. Allow long values, translated
labels, and text zoom to wrap or grow without hiding required information or actions.

Build keyboard, pointer, and touch behavior into the same control contract.
Honor reduced motion and high-contrast preferences, including forced colors,
while retaining visible focus and meaningful state distinctions. Shared tokens
and controls own these adaptations so features inherit consistent behavior.

Follow the [browser-support policy](../foundations/architecture.md#browser-support)
when choosing CSS or DOM APIs. For optional enhancements, define the usable base
experience and use feature detection where an alternative behavior is needed.
Keep any fallback with the component that owns the behavior, and exercise both
paths. Choose native layout and sizing when they meet the contract without custom
measurement or synchronization.

### Identify people consistently

Use [PersonIdentity](../../foundation/ui/src/patterns/person-identity/person-identity.mdx)
for names with avatars and supporting details. Its guidance owns alignment,
wrapping, and composition with links and property controls.

### Orient people and explain outcomes

Use the [application shell](../../foundation/ui/src/patterns/application-shell/application-shell.mdx)
for navigation and account controls. Each interface supplies identity, destinations,
and actions; the product's [page assembly guidance](../../interfaces/product/src/features/README.md#page-composition)
explains its application of the shared frame.

Follow the [feedback pattern](../../foundation/ui/src/patterns/feedback/feedback.mdx)
when presenting success, loading, failure, and recovery. The feature supplies the
actual outcome and recovery action; shared controls own presentation and announcements.

### Confirm consequential actions

Use the shared [ConfirmationDialog](../../foundation/ui/src/patterns/confirmation-dialog/confirmation-dialog.tsx)
for consequential actions. Its [usage guidance](../../foundation/ui/src/patterns/confirmation-dialog/confirmation-dialog.mdx)
explains when confirmation helps, how to describe consequences, and how to present
progress and recovery. The component's API documentation defines caller obligations;
its stories demonstrate each state.

## Build an interactive table

Use `@merit/tables` for already-loaded collections that need shared responsive
rendering and interaction; static evidence tables can use native markup. Features
own content, data loading, and any sorting state. Supply the optional sorting
configuration where ordering helps the task. It holds one column and direction,
or `null` for source order, alongside the change callback and translated labels.

Columns render records directly and declare their layout. Sortable columns supply
both a value accessor and an ascending comparison of records; the table keeps
missing values last. Compare domain values rather than formatted labels. The
[applications view](../../capabilities/grantmaking/web/src/views/rounds/funding-round-view.tsx)
shows comparisons using exact money values. Cell callbacks return content; return
a React component when a cell needs hooks or local state.

The shared table owns reusable interaction and rendering. Read its
[API contract](../../foundation/tables/src/types.ts),
[table behavior](../../foundation/tables/src/data-table.tsx), and
[stories](../../foundation/tables/src/data-table.stories.tsx) for column definitions,
sorting, and responsive layout. It sorts the complete collection in memory;
server pagination and filtering need a data-loading contract that preserves
correct ordering across the whole result.

Keep identity, comparable properties, status, and actions in separate columns.
A person's supporting line identifies them; it should not accumulate workflow
feedback or retry controls. Group related status facts within their column without
collapsing distinct meanings, such as invitation acceptance and email delivery.
Keep each row action in one predictable place. At narrow widths, retain the table's
labelled record presentation rather than squeezing the desktop columns.

Choose scrolling to suit the surrounding work: page flow for continuous reading,
or a bounded region for sustained comparison. Check that headings and record
identity remain clear at narrow widths. The table contract and stories above own
state messages, navigation, responsive rendering, and sticky-header options.

## Connect editing to feature logic

Use the shared [editing pattern](../../foundation/ui/src/patterns/editing/editing.mdx) for action
semantics, property controls, form actions, draft recovery, and conflict handling.
Check the owning workflow for business prerequisites and the scope of a save.

Use `@merit/forms` to connect fields, validation feedback, and submission state.
The feature supplies validation, value conversion, draft persistence, and what
happens after a save; business rules stay in the owning domain module.

For calendar dates, use `FormDateField` in forms and `DateChoice` for a quick
property edit. They share date entry and calendar controls. The
[date field guidance](../../foundation/ui/src/components/fields/date-field/date-field.mdx)
explains draft values, validation, and selection behavior.

The [recommendation editor](../../capabilities/recommendations/web/src/views/recommendations/recommendation-editor.tsx)
shows how to combine the form exports for the
[recommendation workflow](../workflows/recommend-funding.md). Read the
[`useForm` contract](../../foundation/forms/src/form/use-form.ts) when wiring submission
and the [field adapter documentation](../../foundation/forms/src/fields/select.tsx) when
connecting a select. Give the form an accessible name and provide localized labels
and errors.

Define where the draft lives and which actions save, retain, or discard it. Keep
that state separate from whether the editor is open so navigation can follow the
workflow without losing work. Connect pending and failure feedback to the actual
save result, and return focus to a useful control when editing ends. Exercise
entry, validation, saving, cancellation, navigation away and back, and recovery
from failure.

### Choose the right field state

Use the [field guidance](../../foundation/ui/src/components/fields/fields.mdx)
to choose editable, read-only, disabled, and required states and explain validation.
The component owns labels and feedback; the feature connects those states to its work.

### Identify required input

Keep markers consistent with the owning workflow's validation, including when
another choice changes a requirement. A funding recommendation needs an amount;
a deferral hides that field. A rule accepting either a name or an email does not
make both contact fields individually required. Optional values still need to
be valid when supplied.

Saving preparation can accept incomplete information. Enforce later requirements
at the action that needs them, such as **Mark ready for review**, and explain
missing information there. Keep forms focused on labels, values, and corrective
feedback; public guides teach the broader workflow. Add inline explanation only
when it is needed to understand the current action, following the
[copy guide](interface-copy.md#write-interface-copy-in-context).

Give empty or malformed values specific corrective messages and preserve the
person's entries after an unsuccessful save.

## Write interface copy

Use the [interface copy guide](interface-copy.md) for action labels, explanations,
contextual help, relationships between values, and translation catalogs.

## Develop states in Storybook

Follow the [Storybook guide](storybook.md) to organize states, compose providers,
keep examples isolated, and write colocated component guidance.

## Verification

Follow [UI verification](ui-verification.md) for keyboard and touch interaction,
accessibility, responsive layout, copy review, and visual comparisons. Use
[workspace verification](verification.md) for builds, types, and business checks.
