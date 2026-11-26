import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vite-plus/test";

import { useEditorFocusRestore } from "./editor-focus";

const Section = () => {
  const [open, setOpen] = useState(false);
  const { editButton, markRestoreFocus } = useEditorFocusRestore();
  return (
    <>
      <button ref={editButton} onClick={() => setOpen(true)}>
        Edit
      </button>
      <button>Reference</button>
      {open && (
        <button
          onClick={() => {
            markRestoreFocus();
            setOpen(false);
          }}
        >
          Close
        </button>
      )}
      {open && (
        <button
          onClick={() => {
            // A save that finished after the person moved on to the reference pane.
            screen.getByRole("button", { name: "Reference" }).focus();
            markRestoreFocus();
            setOpen(false);
          }}
        >
          Finish late
        </button>
      )}
    </>
  );
};

it("returns focus to the edit action after the editor closes, only once", async () => {
  const user = userEvent.setup();
  render(<Section />);
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();

  (document.activeElement as HTMLElement).blur();
  await user.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
});

it("leaves focus where the person moved it while the editor was still open", async () => {
  const user = userEvent.setup();
  render(<Section />);
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.click(screen.getByRole("button", { name: "Finish late" }));

  expect(screen.getByRole("button", { name: "Reference" })).toHaveFocus();
});
