# MessageBox

Multiline message composer with a growing input, Enter-to-send, optional attached context chips, and a Stop control while an answer is in progress.

## Usage

- Control `value` and `onChange` from the caller, and clear `value` once `onSend` accepts the message.
- Supply `label` for the accessible name; set `isLabelHidden` when a surrounding panel heading already names the composer.
- Pass `chips` to display removable attached items above the input; removing a chip moves focus to the next chip or back into the text area.
- Set `isBusy` while a response is arriving so `Stop` replaces `Send`, or `isSendDisabled` when sending is blocked without a stoppable task.

## Exports

- `MessageBox` — props `label`, `isLabelHidden?`, `placeholder?`, `description?`, `value`, `onChange`, `sendLabel`, `onSend`, `isBusy?`, `isSendDisabled?`, `stopLabel`, `onStop`, `chips?`, `autoFocus?`
