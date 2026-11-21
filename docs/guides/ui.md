# Develop the interface

Start with the work a person needs to do. Use the [experience principles](../foundations/experience.md)
to shape the interaction and the [workflow](../workflows/README.md) to establish
who can act, what information they need, and what their action commits. For
example, a manager can propose an allocation while reading assessments. The
design needs to keep both the evidence and the effect on the proposed budget in reach.

## Work out the interaction

Find a screen where someone already does comparable work. Follow its imports to
the shared pattern and inspect the story for the state that matters. If the
composition is still open, use the [Storybook Overview](../../foundation/ui/src/overview.mdx)
to choose a way to find records, compare information, edit with references, or
authorize a consequence. Its [control chooser](../../foundation/ui/src/overview.mdx#choose-controls-by-outcome)
also covers individual links, buttons, pickers, and dialogs.

Consider the whole interaction. Where did the person come from? What must remain
visible as they act? Where do they return, and what happens to their work if the
action fails? Choose hierarchy and density using representative records, including
long and missing values. A public explanation, a workspace queue, and a sustained
assessment can share controls while giving different amounts of space to reading.

## Review a representative slice

Use the closest accepted screen to work through the ordinary task and the choice
that carries the most consequence. If a request suggests adding a tooltip, first
ask what someone needs to understand and whether a clearer label or grouping
would answer it. Preserve earlier decisions where the same reasoning applies.
The [Team examples](../../interfaces/product/src/features/team/team-design.mdx)
show why an access edit and a removal can call for different emphasis.

## Compose and style a feature

Open Storybook with `vp run storybook` at [localhost:6006](http://localhost:6006).
To look up a particular pattern or API as text, use the catalog to find its ID:

```sh
pnpm --filter @merit/storybook exec storybook tools docs list
pnpm --filter @merit/storybook exec storybook tools docs show --id <id>
```

Build from the component that expresses the information or action. For instance,
`Attribution` identifies who recorded something and when, and `Timeline` presents
recorded events. Shared controls supply typography, surfaces, interaction states,
and accessibility. Use their supported options. When the task needs behavior they
cannot express, identify the gap and extend the shared owner if other callers
need the same behavior. The [UI package guide](../../foundation/ui/README.md#import-and-style)
covers imports, stylesheets, and the boundary between shared and feature styles.

The feature arranges its own content. Use its CSS Module for columns, gaps,
wrapping, overflow, and changes in layout as space runs out. Shared components
provide their own appearance and expose no `className` or `style` override. The
[page composition pattern](../../foundation/ui/src/patterns/page-composition/page-composition.mdx)
shows how to use layout primitives, page headers, and a readable measure before
introducing a feature-specific arrangement.

Preserve reading and keyboard order as columns stack. Let content wrap at larger
text sizes and with longer translations. Shared controls own keyboard, pointer,
touch, focus, reduced-motion, and forced-colors behavior. The feature owns where
focus returns after its work ends and how someone continues in the surrounding
screen. Follow the [browser-support policy](../foundations/architecture.md#browser-support)
when choosing platform behavior.

## Connect the screen to the workflow

- **Collections.** The feature supplies records, meaningful columns, loading and
  recovery actions. Compare domain values when sorting a complete local collection,
  as in [Organizations](../../interfaces/admin/src/features/organizations/views/organizations-table.tsx).
  Order a paged collection on the server before taking the page, as in
  [Applications](../../capabilities/grantmaking/web/src/views/rounds/application-collection.tsx).
  The [table contract](../../foundation/tables/src/data-table.tsx) and
  [column types](../../foundation/tables/src/types.ts) describe the caller's part.
- **Forms.** Use `@merit/forms` for field state, validation feedback, and submission.
  Validate the action being taken. Saving incomplete preparation can succeed while
  **Mark ready for review** still needs more information. Connect requirements
  to their fields and explain what to correct there.
  [Field guidance](../../foundation/ui/src/components/fields/fields.mdx) explains
  editable, required, read-only, and disabled states.
- **Editing and recovery.** The feature decides what commits together, where the
  draft lives, and how the saved result updates the screen. The
  [editing pattern](../../foundation/ui/src/patterns/editing/editing.mdx) covers
  control placement and draft recovery. The [recommendation walkthrough](recommendation-walkthrough.md)
  follows a save through the controller, business operation, and cache update.
- **Navigation.** The interface supplies the workspace, available destinations,
  and route back. Follow the [page assembly guidance](../../interfaces/product/src/features/README.md#page-composition)
  to connect a feature to the shared application shell.

Use the [copy guide](interface-copy.md) for labels, contextual explanations, and
translation. A consequence that affects the person's decision belongs beside the
action even when the [public guides](../../interfaces/site/src/features/docs/README.md)
teach the workflow in greater depth. Use the [Storybook guide](storybook.md) when
authoring an example and [UI verification](ui-verification.md) for rendered checks.
