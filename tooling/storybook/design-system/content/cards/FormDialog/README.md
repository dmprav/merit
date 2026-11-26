# FormDialog

Frames a bounded create or edit task in the shared centred dialog, with a validated `Form`, persistent feedback and `FormActions`.

- Use `FormDialog` for short, bounded editing tasks; sustained assessment or recommendation writing belongs in the reference workspace's work pane.
- Supply `title`, and `context` with `contextLabel` when the parent record helps people identify what they are working within. Control it with `isOpen`/`onOpenChange` (or `defaultOpen`) and pass `trigger` for the opening control; `closeLabel` names the header close button.
- Every form dialog shares one width and position; callers do not choose a size. The contained `Form` inherits a scrolling body, persistent feedback and actions, and Cmd/Ctrl+Enter submission.
- Build the form with `useForm({ defaultValues, schema, onSubmit, submitErrorMessage, onChange? })`. It validates on the first submit, then on change. `defaultValues` are captured on mount, so remount when switching records. `onSubmit` returns `null` on success or a localized failure message.
- Wrap `schema` with `useTranslatedSchema(schema, message?)` to localize Zod issues per form without changing shared rules.
- Pair the returned `submission` with `Form` (`submission`, `label`, `children`, `actions`). `Form` names the form, focuses the first invalid control after validation, announces save errors as an inline `danger` notice, and disables fields and their popups while saving.
- Outside a dialog, set `stickyActions` on a long form that scrolls with its pane, so its actions, status, and save error sit in the frame footer, `layout="inline"` for a single field with its actions beside it, `scrollFields` for a bounded parent, and `submitOnModEnter` for keyboard submission. Forms accept no class name.
- Use `FormActions` for the footer: `submission`, `onCancel`, task-specific `cancelLabel`, `submitLabel` and `submittingLabel`, optional `isSubmitDisabled`, and optional `discard` (`{ label, onPress }`). Closing preserves unfinished work; discarding removes it.
- Pass the pending state to `isDismissDisabled` so the close control and Escape are blocked during the same operation the actions block.
- Keep failed saves open with their input intact. Features own drafts, business validation, saving and the outcome after commitment.
- Fields are separated by `space-2`; the footer area has even `space-4` block padding, with `space-3` between feedback and actions.

Exports: `FormDialog`, `Form`, `FormActions`, `useForm`, `useTranslatedSchema`.
