# ConfirmationDialog

A narrow centred dialog for reviewing the consequences of a consequential action — such as revoking an invitation or removing access — before committing.

## Usage

- Confirm only consequential actions; routine, recoverable edits proceed without confirmation.
- Supply `title` as a question naming the action, `description` naming the affected person or work and what changes, and `children` for further consequences (plain paragraphs).
- Give `confirmLabel` a specific action ("Revoke invitation") and `cancelLabel` a specific keep option ("Keep invitation"). Cancel receives initial focus, so opening never commits.
- Use `intent="destructive"` for removal or loss; it renders the confirm action in `danger`.
- The feature owns the operation: control `isOpen`/`onOpenChange`, run `onConfirm`, and close after success.
- Set `isPending` during the operation: `pendingLabel` replaces the confirm label ("Revoking invitation…") and confirmation and dismissal are blocked.
- On failure keep the dialog open and pass `error`; it appears as inline danger feedback above the footer, preserving context to retry.
- Pass `trigger` for the opening control; triggerless flows must restore focus to a useful control on close. `closeLabel` defaults to the shared "Close dialog".
- Use a form dialog when the person must edit several values.

## Exports

- `ConfirmationDialog` — props `title`, `description`, `children?`, `closeLabel?`, `cancelLabel`, `confirmLabel`, `pendingLabel?`, `intent?`, `isOpen`, `onOpenChange`, `onConfirm`, `trigger?`, `isPending?`, `error?`
