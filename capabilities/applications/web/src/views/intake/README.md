# Compose application intake

Use this guide when changing application editors and their surrounding reading
view. The [intake workflow](../../../../../../docs/workflows/record-applications.md)
owns readiness, saved records, attribution, and conflict behavior. The shared
[editing pattern](../../../../../../foundation/ui/src/patterns/editing/editing.mdx)
owns save, close, discard, and draft recovery conventions.

## Keep edits beside their content

[ApplicationIntake](intake-content.tsx) owns the title, details, submitted material,
staff summary, and feedback; the application screen arranges those regions.
Place each edit action beside its heading, without duplicate section-edit commands
in **Application actions**:

| Region               | Editor                                                          |
| -------------------- | --------------------------------------------------------------- |
| Page title           | Rename during preparation; correct the title after recording.   |
| Application details  | Applicant, contact, requested amount, and project dates.        |
| Applicant submission | Ordered headings or questions and applicant responses.          |
| Staff summary        | The manager's interpretation, separate from submitted material. |

The details editor keeps the reading view's label/value rows, replacing editable
values with inputs while leaving the submission date read-only. The contact picker
inside that form waits for Save; the standalone picker commits immediately and
offers Undo. Explain when a working revision saves a contact change immediately
while material remains unpublished.

Show the staff summary in the working panel alongside application details. When
absent, offer **Add staff summary** without an empty summary block. Submitted
material entered during creation starts as a **Submitted material** section.

## Make preparation and revision states clear

Each section's editor offers save, close, and discard controls. Keep the heading
and response together and use a section menu for moving or removing a section.
**Resume application** reopens unfinished creation; section actions identify
unfinished writing with **Continue editing**. Saving or discarding one section
must leave the others' drafts intact.

Show missing-field guidance while preparation is incomplete; a complete record
needs only **Mark ready for review**. Keep marking ready and recording a revision
separate from editing, after unsaved application content has been saved or
discarded. During preparation, omit empty recommendation and review sections
while retaining their actions. Existing deferrals, requests, and assessments stay
visible.

Keep **Correct intake** and **Discard working revision** in **Application actions**.
Offer **Start revised submission** with submission management as well as in the
actions menu. A recorded-title correction retains the current heading until the
correction is recorded. Identify the working revision and the version still current.
Use **Review saved working revision** outside the editor and **View current
submission** while editing, preserving unsaved writing. Shared-revision discard
requires confirmation; local draft discard follows the shared editing pattern.
Deletion and shared-revision discard retain the revision seen when confirmation
opened. A refresh or retry cannot advance that baseline; after a conflict, close
the dialog, review the current work, and open confirmation again.

Version comparisons show changed material before and after. Keep unchanged
sections readable once, marked **Unchanged**. Preserve attribution and routes to
application history without making readers leave the comparison.

## Connect editors to intake actions

The [intake controller](../../controllers/intake/use-application-intake.ts) owns
section eligibility, opening an editor, original revision baselines, and save
commands. Forms receive its focused editor interface and supply edited values.
The pure [intake state helpers](../../controllers/intake/intake-state.ts) build
section saves and title corrections from those values and their baselines.
Keep this coordination out of controls so a background refresh cannot silently
replace the revision against which someone started writing.

The [application navigation hook](../../../../../grantmaking/web/src/views/applications/use-application-navigation.ts)
owns reference-pane transitions, reading positions, and cross-pane focus for the
[application view](../../../../../grantmaking/web/src/views/applications/application-view.tsx). Local choices and
external tab changes use the same transition; delayed URL acknowledgements must
preserve a newer local choice. Editors restore focus to their triggers. Keep
reference content mounted when switching panes so reading position and unfinished
work survive; keep mutable focus registries private to the hook.

## Verify in context

Use the [application-management stories](../../../../../../interfaces/product/src/features/grantmaking/views/intake/application-intake.stories.tsx)
for connected editors and [application-view stories](../../../../../grantmaking/web/src/views/applications/application-view.stories.tsx)
for their reading context. The [intake tests](../../../../../grantmaking/web/src/views/intake/application-intake.test.tsx) cover
focused interactions. Check preparation, recorded material, a working revision,
independent unfinished sections, and stale edits. Form tests show each section's
conflict disclosure; state tests own the saved command for a chosen resolution. Use
[UI verification](../../../../../../docs/guides/ui-verification.md) for layout,
focus, and narrow-screen review.
