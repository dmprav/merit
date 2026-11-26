import { useEffect, useRef } from "react";

/**
 * Returns focus to a section's edit action after its editor closes. Attach `editButton` to
 * the action and call `markRestoreFocus` from the close handler; focus moves on the next
 * render, once the action is back in the page. Focus returns only when it was inside the
 * editor, which leaves it on the page body once the editor unmounts; a person who moved focus
 * elsewhere while a save was pending keeps it there.
 */
export const useEditorFocusRestore = () => {
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current && editButton.current) {
      const active = document.activeElement;
      if (!active || active === document.body) {
        editButton.current.focus();
      }
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
