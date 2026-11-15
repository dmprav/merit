import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import { Button } from "../button/button";
import { ModalDialog } from "./dialog";

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
    expect(within(dialog).queryAllByText("Neighbourhood grants")).toHaveLength(contextCount);
    expect(within(dialog).queryAllByText("Round:")).toHaveLength(labelCount);
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

describe("search appearance", () => {
  const SearchDialog = ({ onField }: { onField?: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setIsOpen(true)}>
          Open search
        </button>
        <ModalDialog
          appearance="search"
          title="Search the workspace"
          closeLabel="Close search"
          trigger={null}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          data-testid="search-overlay"
        >
          {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
          <input aria-label="Query" autoFocus={onField} />
        </ModalDialog>
      </>
    );
  };

  it("names the dialog without a visible title bar and offers a small close control", async () => {
    const user = userEvent.setup();
    render(<SearchDialog onField />);
    await user.click(screen.getByRole("button", { name: "Open search" }));
    const dialog = screen.getByRole("dialog", { name: "Search the workspace" });

    expect(within(dialog).queryByRole("heading")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Search the workspace")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close search" })).toBeVisible();
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: "Query" })).toHaveFocus(),
    );
  });

  it.each(["Escape", "close button", "outside press"])(
    "closes on %s and returns focus to where it was",
    async (how) => {
      const user = userEvent.setup();
      render(<SearchDialog onField />);
      const opener = screen.getByRole("button", { name: "Open search" });
      await user.click(opener);
      await screen.findByRole("dialog", { name: "Search the workspace" });

      if (how === "Escape") {
        await user.keyboard("{Escape}");
      } else if (how === "close button") {
        await user.click(screen.getByRole("button", { name: "Close search" }));
      } else {
        await user.click(screen.getByTestId("search-overlay"));
      }

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(opener).toHaveFocus());
    },
  );
});
