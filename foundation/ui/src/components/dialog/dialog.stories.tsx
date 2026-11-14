import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, waitFor, within } from "storybook/test";

import { Button } from "../button/button";
import { Inline } from "../layout/layout";
import { DialogContent, ModalDialog, PopoverDialog } from "./dialog";
import localStyles from "./dialog.stories.module.css";

const DialogExample = (args: ComponentProps<typeof ModalDialog>) => {
  const [open, setOpen] = useState(false);
  return (
    <PopoverDialog
      title={args.title}
      closeLabel={args.closeLabel}
      trigger={args.trigger}
      isOpen={open}
      onOpenChange={setOpen}
    >
      {args.children}
    </PopoverDialog>
  );
};

const meta = {
  title: "Components/Dialog",
  component: ModalDialog,
  tags: ["!autodocs"],
  args: {
    title: "An example dialog",
    closeLabel: "Close dialog",
    isDismissable: true,
    trigger: <Button variant="secondary">Open dialog</Button>,
    children: (
      <DialogContent label="Dialog information">
        <p className={localStyles.description}>
          Nothing will be published or changed in the funding round. Escape closes this dialog and
          returns focus to its trigger.
        </p>
      </DialogContent>
    ),
  },
} satisfies Meta<typeof ModalDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Popover: Story = {
  args: {
    children: (
      <p className={localStyles.description}>
        Nothing will be published or changed in the funding round. Escape closes this dialog and
        returns focus to its trigger.
      </p>
    ),
  },
  render: (args) => <DialogExample {...args} />,
  play: async ({ canvas, userEvent, canvasElement }) => {
    const trigger = canvas.getByRole("button", { name: "Open dialog" });
    await userEvent.click(trigger);
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "An example dialog",
    });

    await waitFor(() => expect(dialog).toBeVisible());

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
  },
};
export const TriggerFocused: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const trigger = canvas.getByRole("button", { name: "Open dialog" });

    await expect(trigger).toHaveFocus();
    await expect(trigger).toHaveAttribute("data-focus-visible", "true");
  },
};
export const CloseButtonFocused: Story = {
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.tab();

    await expect(canvas.getByRole("button", { name: "Open dialog" })).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "An example dialog",
    });
    const close = within(dialog).getByRole("button", { name: "Close dialog" });

    await waitFor(() => expect(dialog).toHaveFocus());

    await userEvent.tab();

    await waitFor(() => expect(close).toHaveFocus());
    await expect(close).toHaveAttribute("data-focus-visible", "true");
  },
};
export const Open: Story = {
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));

    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "An example dialog" }),
      ).toBeVisible(),
    );
  },
};

const searchQueryLabel = "Search by name";

export const Search: Story = {
  args: {
    appearance: "search",
    title: "Search the workspace",
    closeLabel: "Close search",
    trigger: <Button variant="secondary">Open search</Button>,
    children: (
      <label className={localStyles.searchField}>
        <span className={localStyles.searchLabel}>{searchQueryLabel}</span>
        {/* The dialog's initial focus is the field, as in a search box. */}
        {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
        <input autoFocus className={localStyles.searchInput} placeholder={searchQueryLabel} />
      </label>
    ),
  },
  play: async ({ canvas, userEvent, canvasElement }) => {
    const trigger = canvas.getByRole("button", { name: "Open search" });
    await userEvent.click(trigger);
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "Search the workspace",
    });

    await waitFor(() => expect(dialog).toBeVisible());
    await waitFor(() => expect(within(dialog).getByRole("textbox")).toHaveFocus());
    await expect(within(dialog).queryByRole("heading")).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
  },
};

export const WithActions: Story = {
  args: {
    title: "Review guidance",
    children: ({ close }) => (
      <DialogContent
        label="Review guidance"
        footer={
          <Inline justify="end">
            <Button onPress={close}>Done</Button>
          </Inline>
        }
      >
        <p className={localStyles.description}>
          Compare the application with its supporting evidence. Keep applicant statements separate
          from reviewer judgments, and record questions that need clarification.
        </p>
      </DialogContent>
    ),
  },
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));

    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Review guidance" }),
      ).toBeVisible(),
    );
  },
};

const EvidenceSections = () => (
  <div className={localStyles.sections}>
    {[
      [
        "Understand the request",
        "Read what the applicant proposes to do, who the work is intended to reach, and what support they are requesting. Keep the original request available when comparing it with later assessments.",
      ],
      [
        "Inspect the evidence",
        "Open the source passages behind important claims. Consider what each source establishes and what remains uncertain. A summary can help you navigate, but the supporting material provides the context.",
      ],
      [
        "Check document versions",
        "Check which application version each review refers to. If the application has changed, keep the earlier assessment visible and identify which observations may need another look.",
      ],
      [
        "Compare reviewer judgments",
        "Read the reasons behind each assessment. Differences between reviewers can reveal questions worth discussing; keep their judgments distinct from the facts provided by the applicant.",
      ],
      [
        "Consider the proposed allocation",
        "Compare the requested amount with the proposed allocation and the available round budget. Explain the reasoning behind the recommendation so another person can understand the trade-offs.",
      ],
      [
        "Record open questions",
        "Write down missing information and questions deliberately left for discussion. Keep these separate from completed checks so people can see what is ready and what still needs attention.",
      ],
    ].map(([title, description]) => (
      <section key={title}>
        <h3 className={localStyles.sectionTitle}>{title}</h3>
        <p>{description}</p>
      </section>
    ))}
  </div>
);

export const LongContent: Story = {
  args: {
    size: "wide",
    title:
      "Read the supporting evidence before preparing your recommendation for the funding round",
    children: ({ close }) => (
      <DialogContent
        label="Supporting evidence guidance"
        reading
        footer={
          <Inline justify="end">
            <Button onPress={close}>Done</Button>
          </Inline>
        }
      >
        <EvidenceSections />
      </DialogContent>
    ),
  },
  play: async ({ canvas, userEvent, canvasElement, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));

    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", { name: args.title }),
      ).toBeVisible(),
    );
  },
};

export const FloatingLongContent: Story = {
  ...LongContent,
  args: {
    title: LongContent.args!.title,
    children: <EvidenceSections />,
  },
  render: (args) => <DialogExample {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          "Floating reference panels keep their heading and close control visible while scrolling. Long titles wrap beside the actions, and the body uses the shared keyboard-scrollable region. Pass content directly; the floating dialog supplies its own DialogContent.",
      },
    },
  },
};

export const KeyboardFocusContained: Story = {
  ...WithActions,
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.tab();

    await expect(canvas.getByRole("button", { name: "Open dialog" })).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole("dialog", { name: "Review guidance" });
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    const content = within(dialog).getByRole("region", { name: "Review guidance" });
    const done = within(dialog).getByRole("button", { name: "Done" });

    await waitFor(() => expect(dialog).toHaveFocus());

    await userEvent.tab();

    await expect(close).toHaveFocus();

    await userEvent.tab();

    await expect(content).toHaveFocus();

    await userEvent.tab();

    await expect(done).toHaveFocus();

    await userEvent.tab();

    await expect(close).toHaveFocus();

    await userEvent.tab({ shift: true });

    await expect(done).toHaveFocus();
  },
};

export const KeyboardDismissal: Story = {
  args: {
    children: (
      <DialogContent label="Dialog information">
        <p className={localStyles.description}>
          Press Escape to close this dialog and return focus to the Open dialog button.
        </p>
      </DialogContent>
    ),
  },
  play: async ({ canvas, userEvent, canvasElement }) => {
    const trigger = canvas.getByRole("button", { name: "Open dialog" });
    await userEvent.tab();

    await expect(trigger).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    const body = within(canvasElement.ownerDocument.body);

    await waitFor(() =>
      expect(body.getByRole("dialog", { name: "An example dialog" })).toBeVisible(),
    );
  },
};

export const BackdropDismissal: Story = {
  ...Open,
  args: {
    isDismissable: true,
    children: (
      <DialogContent label="Dialog information">
        <p className={localStyles.description}>
          Click the shaded backdrop outside this dialog to close it. You can also press Escape or
          use the close button. Focus returns to the Open dialog button.
        </p>
      </DialogContent>
    ),
  },
};

export const BackdropDismissalDisabled: Story = {
  ...BackdropDismissal,
  args: {
    isDismissable: false,
    children: (
      <DialogContent label="Dialog information">
        <p className={localStyles.description}>
          Clicking the shaded backdrop leaves this dialog open. Press Escape or use the close button
          to close it. Focus returns to the Open dialog button.
        </p>
      </DialogContent>
    ),
  },
};

const ControlledDialog = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <p className={localStyles.status}>Dialog is {isOpen ? "open" : "closed"}.</p>
      <ModalDialog
        title="Controlled dialog"
        closeLabel="Close dialog"
        trigger={<Button>Open dialog</Button>}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      >
        <DialogContent label="Dialog information">
          <p className={localStyles.description}>
            Close this dialog to update its controlled state.
          </p>
        </DialogContent>
      </ModalDialog>
    </>
  );
};

export const Controlled: Story = {
  render: () => <ControlledDialog />,
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));

    await expect(canvas.getByText("Dialog is open.")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Controlled dialog" }),
      ).toBeVisible(),
    );
  },
};
