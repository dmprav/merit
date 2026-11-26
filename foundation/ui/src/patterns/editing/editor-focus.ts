import { useEffect, useRef } from "react";

/**
 * Returns focus to a section's edit action after its editor closes. Attach `editButton` to
 * the action and call `markRestoreFocus` from the close handler; focus moves on the next
 * render, once the action is back in the page.
 */
export const useEditorFocusRestore = () => {
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current && editButton.current) {
      editButton.current.focus();
      restoreFocus.current = false;
    }
  });

  return {
    editButton,
    markRestoreFocus: () => {
      restoreFocus.current = true;
    },
  };
};
