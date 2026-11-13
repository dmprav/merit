import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import { Button } from "../button/button";
import { ModalDialog } from "./dialog";

it.each([
  { contextLabel: "Round", labelCount: 1 },
  { contextLabel: undefined, labelCount: 0 },
])(
  "keeps the dialog named by its title with context label $contextLabel",
  async ({ contextLabel, labelCount }) => {
    const user = userEvent.setup();
    render(
      <ModalDialog
        title="Record application"
        context="Neighbourhood grants"
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
    expect(within(dialog).getByText("Neighbourhood grants")).toBeVisible();
    expect(within(dialog).queryAllByText("Round:")).toHaveLength(labelCount);

    await user.click(within(dialog).getByRole("button", { name: "Close editor" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  },
);

it.each([undefined, ""])("omits the context label when context is %s", (context) => {
  render(
    <ModalDialog
      title="Record application"
      context={context}
      contextLabel="Round"
      closeLabel="Close editor"
      trigger={null}
      defaultOpen
    >
      <p>Record the application details.</p>
    </ModalDialog>,
  );
  const dialog = screen.getByRole("dialog", { name: "Record application" });

  expect(within(dialog).getByRole("heading", { name: "Record application" })).toBeVisible();
  expect(within(dialog).queryByText("Round:")).not.toBeInTheDocument();
});

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
