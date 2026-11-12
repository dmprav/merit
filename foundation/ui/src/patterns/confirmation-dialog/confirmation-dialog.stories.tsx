import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../../components/button/button";
import { ConfirmationDialog } from "./confirmation-dialog";

const ConfirmationExample = (args: ComponentProps<typeof ConfirmationDialog>) => {
  const [open, setOpen] = useState(args.isOpen);

  return (
    <ConfirmationDialog
      {...args}
      isOpen={open}
      onOpenChange={(open) => {
        args.onOpenChange(open);
        setOpen(open);
      }}
      onConfirm={() => {
        args.onConfirm();
        setOpen(false);
      }}
      trigger={<Button variant="secondary">Review revocation</Button>}
    />
  );
};

const meta = {
  title: "Patterns/Confirmation dialog",
  component: ConfirmationDialog,
  tags: ["!autodocs"],
  // Opening is driven by the trigger so focus behavior remains realistic.
  argTypes: { isOpen: { control: false }, trigger: { control: false } },
  args: {
    title: "Revoke invitation?",
    description:
      "alex@example.org will no longer be able to join the workspace using this invitation. You can send a new invitation later.",
    closeLabel: "Close dialog",
    cancelLabel: "Keep invitation",
    confirmLabel: "Revoke invitation",
    pendingLabel: "Revoking invitation…",
    intent: "destructive",
    isOpen: false,
    onOpenChange: fn(),
    onConfirm: fn(),
  },
  render: (args) => <ConfirmationExample {...args} />,
} satisfies Meta<typeof ConfirmationDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Review revocation" }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "Revoke invitation?",
    });

    await waitFor(() => expect(dialog).toBeVisible());
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Keep invitation" })).toHaveFocus(),
    );
  },
};
export const Pending: Story = {
  args: { isPending: true },
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Review revocation" }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog");

    await expect(
      within(dialog).getByRole("button", { name: "Revoking invitation…" }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(within(dialog).getByRole("button", { name: "Keep invitation" })).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "Close dialog" })).toBeDisabled();
  },
};
export const Failure: Story = {
  ...Open,
  args: { error: "The invitation could not be revoked. Check your connection and try again." },
};
export const LongContent: Story = {
  ...Open,
  args: {
    description:
      "This invitation was sent to alexandria.montgomery-worthington@community-partnerships.example.org. Revoking it prevents this recipient from joining the workspace through the existing email. Any other active invitations remain available, and you can send a new invitation to this recipient later.",
  },
};

const RetryExample = (args: ComponentProps<typeof ConfirmationDialog>) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [succeeded, setSucceeded] = useState(false);

  return (
    <>
      <p role="status">
        {succeeded
          ? "Invitation revoked."
          : "The first attempt fails. Retry to complete the revocation."}
      </p>
      <ConfirmationDialog
        {...args}
        trigger={<Button variant="secondary">Review revocation</Button>}
        isOpen={open}
        isPending={pending}
        error={error}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setAttempts(0);
            setError(null);
            setSucceeded(false);
          }
          setOpen(nextOpen);
        }}
        onConfirm={async () => {
          setError(null);
          setPending(true);
          await new Promise((resolve) => setTimeout(resolve, 800));
          setPending(false);
          setAttempts(attempts + 1);
          if (attempts === 0) {
            setError("The invitation could not be revoked. Check your connection and try again.");
          } else {
            setSucceeded(true);
            setOpen(false);
          }
        }}
      />
    </>
  );
};

export const Retry: Story = {
  ...Open,
  argTypes: {
    isOpen: { control: false },
    isPending: { control: false },
    error: { control: false },
  },
  render: (args) => <RetryExample {...args} />,
};
