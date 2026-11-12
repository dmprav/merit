import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { Button } from "../../components/button/button";
import { ConfirmationDialog } from "./confirmation-dialog";

const Example = ({ confirm }: { confirm: () => Promise<string | null> }) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <ConfirmationDialog
      title="Revoke invitation?"
      description="The recipient will no longer be able to join using this invitation."
      closeLabel="Close dialog"
      cancelLabel="Keep invitation"
      confirmLabel="Revoke invitation"
      pendingLabel="Revoking invitation…"
      intent="destructive"
      trigger={<Button>Review revocation</Button>}
      isOpen={open}
      onOpenChange={setOpen}
      isPending={pending}
      error={error}
      onConfirm={async () => {
        setError(null);
        setPending(true);
        const result = await confirm();
        setError(result);
        setPending(false);
        if (!result) {
          setOpen(false);
        }
      }}
    />
  );
};

it.each(["Escape", "Close dialog", "Keep invitation"])(
  "%s cancels without committing and restores trigger focus",
  async (action) => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(<Example confirm={confirm} />);
    const trigger = screen.getByRole("button", { name: "Review revocation" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Revoke invitation?" });

    expect(dialog).toHaveAccessibleDescription(
      "The recipient will no longer be able to join using this invitation.",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Keep invitation" })).toHaveFocus(),
    );

    if (action === "Escape") {
      await user.keyboard("{Escape}");
    } else {
      await user.click(screen.getByRole("button", { name: action }));
    }

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
);

it("blocks repeated confirmation and every dismissal while pending, then permits retry after failure", async () => {
  const user = userEvent.setup();
  let finish!: (error: string | null) => void;
  const confirm = vi.fn(
    () =>
      new Promise<string | null>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Example confirm={confirm} />);
  const trigger = screen.getByRole("button", { name: "Review revocation" });
  await user.click(trigger);
  const action = screen.getByRole("button", { name: "Revoke invitation" });
  await user.click(action);

  expect(action).toHaveAccessibleName("Revoking invitation…");
  expect(action).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("button", { name: "Keep invitation" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();

  await user.click(action);
  await user.keyboard("{Enter}{Escape}");
  await user.click(screen.getByRole("button", { name: "Keep invitation" }));
  await user.click(screen.getByRole("button", { name: "Close dialog" }));
  const dialog = screen.getByRole("dialog");
  await user.click(dialog.parentElement!.parentElement!);

  expect(dialog).toBeVisible();
  expect(confirm).toHaveBeenCalledTimes(1);

  await act(async () => finish("Could not revoke the invitation. Try again."));

  expect(screen.getByRole("alert")).toHaveTextContent("Could not revoke");
  expect(screen.getByRole("button", { name: "Keep invitation" })).toBeEnabled();

  await user.click(action);

  expect(confirm).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();

  await act(async () => finish(null));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});
