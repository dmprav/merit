import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { Button } from "../button/button";
import { DialogContent, ModalDialog, PopoverDialog, SidePanel } from "./dialog";

it.each([
  { context: "Neighbourhood grants", contextLabel: "Round", contextCount: 1, labelCount: 1 },
  { context: "Neighbourhood grants", contextLabel: undefined, contextCount: 1, labelCount: 0 },
  { context: undefined, contextLabel: "Round", contextCount: 0, labelCount: 0 },
  { context: "", contextLabel: "Round", contextCount: 0, labelCount: 0 },
])(
  "keeps the dialog named by its title and labels context $context only with a label ($contextLabel)",
  ({ context, contextLabel, contextCount, labelCount }) => {
    render(
      <ModalDialog
        title="Record application"
        context={context}
        contextLabel={contextLabel}
        closeLabel="Close editor"
        trigger={null}
        defaultOpen
      >
        <p>Record the application details.</p>
      </ModalDialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Record application" });

    expect(within(dialog).getByRole("heading", { name: "Record application" })).toBeVisible();
    expect(within(dialog).queryAllByText(/Neighbourhood grants$/)).toHaveLength(contextCount);
    expect(within(dialog).queryAllByText(/^Round:/)).toHaveLength(labelCount);
  },
);

const openDialog = async (isDismissable: boolean) => {
  const user = userEvent.setup();
  render(
    <ModalDialog
      title="Review guidance"
      closeLabel="Close dialog"
      trigger={<Button>Open dialog</Button>}
      isDismissable={isDismissable}
      data-testid="dialog-overlay"
    >
      <p>Read the supporting evidence.</p>
    </ModalDialog>,
  );
  const trigger = screen.getByRole("button", { name: "Open dialog" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Review guidance" });

  expect(dialog).toBeVisible();
  await waitFor(() => expect(dialog).toHaveFocus());

  return { user, trigger };
};

it("dismisses on backdrop clicks, keeps content clicks open, and restores trigger focus", async () => {
  const { user, trigger } = await openDialog(true);
  await user.click(screen.getByText("Read the supporting evidence."));

  expect(screen.getByRole("dialog", { name: "Review guidance" })).toBeVisible();

  await user.click(screen.getByTestId("dialog-overlay"));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("ignores backdrop clicks when disabled while allowing Escape and the close button", async () => {
  const { user, trigger } = await openDialog(false);
  await user.click(screen.getByTestId("dialog-overlay"));
  const dialog = screen.getByRole("dialog", { name: "Review guidance" });

  expect(dialog).toBeVisible();
  await waitFor(() => expect(dialog).toHaveFocus());

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());

  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Close dialog" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("contains keyboard focus in a side panel and returns it to the opener", async () => {
  const user = userEvent.setup();
  render(
    <SidePanel
      title="Related applications"
      closeLabel="Close applications"
      trigger={<Button>2 applications</Button>}
    >
      <DialogContent label="Related applications">
        <a href="/first">First application</a>
        <a href="/last">Last application</a>
      </DialogContent>
    </SidePanel>,
  );
  const trigger = screen.getByRole("button", { name: "2 applications" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Related applications" });
  expect(dialog).toHaveAttribute("data-modal-dialog", "end");
  const last = within(dialog).getByRole("link", { name: "Last application" });
  last.focus();
  await user.tab();
  expect(within(dialog).getByRole("button", { name: "Close applications" })).toHaveFocus();
  await user.tab();
  expect(within(dialog).getByRole("region", { name: "Related applications" })).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
});

const ControlledDialog = ({ withTrigger }: { withTrigger: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <p>Dialog is {isOpen ? "open" : "closed"}.</p>
      {!withTrigger && <Button onPress={() => setIsOpen(true)}>Open dialog</Button>}
      <ModalDialog
        title="Controlled dialog"
        closeLabel="Close dialog"
        trigger={withTrigger ? <Button>Open dialog</Button> : null}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      >
        {({ close }) => <Button onPress={close}>Done</Button>}
      </ModalDialog>
    </>
  );
};

describe.each([true, false])("controlled dialog with trigger %s", (withTrigger) => {
  it.each(["Escape", "Close dialog", "Done"])(
    "updates controlled state through %s, restores focus, and can reopen",
    async (action) => {
      const user = userEvent.setup();
      render(<ControlledDialog withTrigger={withTrigger} />);
      const trigger = screen.getByRole("button", { name: "Open dialog" });
      await user.tab();

      expect(trigger).toHaveFocus();

      await user.keyboard("{Enter}");
      const dialog = screen.getByRole("dialog", { name: "Controlled dialog" });

      expect(screen.getByText("Dialog is open.")).toBeInTheDocument();
      await waitFor(() => expect(dialog).toHaveFocus());

      if (action === "Escape") {
        await user.keyboard("{Escape}");
      } else {
        await user.click(screen.getByRole("button", { name: action }));
      }

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText("Dialog is closed.")).toBeVisible();
      await waitFor(() => expect(trigger).toHaveFocus());

      await user.keyboard("{Enter}");

      expect(screen.getByRole("dialog", { name: "Controlled dialog" })).toBeVisible();
      expect(screen.getByText("Dialog is open.")).toBeInTheDocument();
    },
  );
});

it("frames a centered dialog with one header, one scrolling body, and a footer with feedback above actions", () => {
  render(
    <ModalDialog title="Record application" trigger={null} defaultOpen>
      <DialogContent feedback={<p>Could not save.</p>} footer={<button>Save</button>}>
        <p>Details</p>
      </DialogContent>
    </ModalDialog>,
  );
  const dialog = screen.getByRole("dialog", { name: "Record application" });
  const footer = dialog.querySelector("[data-frame-footer]");

  expect(dialog).toHaveAttribute("data-frame", "center");
  expect(dialog.querySelectorAll("[data-dialog-header]")).toHaveLength(1);
  expect(dialog.querySelectorAll("[data-frame-body]")).toHaveLength(1);
  expect(within(dialog).getByText("Details").closest("[data-frame-footer]")).toBeNull();
  expect(footer).toContainElement(within(dialog).getByText("Could not save."));
  expect(within(dialog).getByText("Could not save.").closest("[data-dialog-feedback]")).toBe(
    footer?.firstElementChild,
  );
  expect(footer?.lastElementChild).toContainElement(
    within(dialog).getByRole("button", { name: "Save" }),
  );
  // Short viewports scroll with a stylesheet query, not a measured attribute.
  expect(dialog).not.toHaveAttribute("data-scroll-content");
});

it("frames a reference popover with the same header and a footer inside the body's frame", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const user = userEvent.setup();
  render(
    <PopoverDialog
      title="Scoring guide"
      closeLabel="Close guide"
      trigger={<Button>Open guide</Button>}
      footer={<button>Copy link</button>}
    >
      <p>Guide text</p>
    </PopoverDialog>,
  );
  await user.click(screen.getByRole("button", { name: "Open guide" }));
  const dialog = screen.getByRole("dialog", { name: "Scoring guide" });

  expect(dialog).toHaveAttribute("data-frame", "popover");
  expect(
    within(dialog).getByRole("heading", { name: "Scoring guide" }).closest("[data-dialog-header]"),
  ).not.toBeNull();
  expect(
    within(dialog).getByRole("button", { name: "Copy link" }).closest("[data-frame-footer]"),
  ).not.toBeNull();
  expect(dialog.querySelectorAll("[data-frame-body]")).toHaveLength(1);
  vi.unstubAllGlobals();
});
