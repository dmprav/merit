# Tooltip

Answer a brief, optional question about a control that keeps its own clear label.

- Use tooltips sparingly, mainly to name ambiguous icon actions. Clear text labels usually need none.
- Keep requirements, consequences, and recovery visible beside the task. Use field descriptions for input guidance, `Disclosure` for occasional supporting material, and `StatusIndicator` for a qualification beside a status value.
- `children` must be a focusable React Aria control with its own accessible name, such as `Button`. For a native link or a ref-forwarding router link, set `customTrigger`.
- `content` is plain text only, so the tooltip cannot become an inaccessible container for links or buttons. Prefer a short phrase or sentence; longer text wraps within a bounded width.
- `placement` defaults to `top`; pick the side that leaves nearby work visible (it flips at the viewport edge). `isDisabled` turns it off.
- Tooltips open on keyboard focus immediately and after a 350 ms hover delay, close after a short delay or with Escape, and do not appear on touch. Keep the task usable without them.
- Don't attach the only explanation of an unavailable action to a disabled button, which cannot receive focus.
- Appearance: the shared popover surface (`surface`, `border-raised`, `popover-radius`, `popover-shadow`) with its own padding and `--text-detail` type, fading in and out, 6px from the trigger.

Exports: `Tooltip`.
