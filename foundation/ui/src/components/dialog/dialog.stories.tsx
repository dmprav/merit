import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, waitFor, within } from "storybook/test";

import { ChoiceList } from "../../patterns/editing/choice-list";
import { Button } from "../button/button";
import { Inline } from "../layout/layout";
import { Text } from "../text/text";
import {
  DialogContent,
  DialogSection,
  ModalDialog,
  PickerPopover,
  PopoverDialog,
  SidePanel as SidePanelFrame,
} from "./dialog";

const PopoverExample = (args: ComponentProps<typeof ModalDialog>) => {
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

const guidanceWithActions = ({ close }: { close: () => void }) => (
  <DialogContent
    footer={
      <Inline justify="end">
        <Button onPress={close}>Done</Button>
      </Inline>
    }
  >
    <Text as="p" variant="supporting">
      Compare the application with its supporting evidence. Keep applicant statements separate from
      reviewer judgments, and record questions that need clarification.
    </Text>
  </DialogContent>
);

const meta = {
  title: "Components/Dialog",
  component: ModalDialog,
  subcomponents: {
    SidePanel: SidePanelFrame,
    PopoverDialog,
    PickerPopover,
    DialogContent,
    DialogSection,
  },
  tags: ["!autodocs"],
  argTypes: {
    trigger: { control: false },
    children: { control: false },
  },
  args: {
    title: "Review guidance",
    closeLabel: "Close dialog",
    trigger: <Button variant="secondary">Open dialog</Button>,
    children: (
      <DialogContent>
        <Text as="p" variant="supporting">
          Nothing will be published or changed in the funding round. Escape closes this dialog and
          returns focus to its trigger.
        </Text>
      </DialogContent>
    ),
  },
} satisfies Meta<typeof ModalDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

const opensDialog: Story["play"] = async ({ canvas, userEvent, canvasElement, args }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));

  await waitFor(() =>
    expect(
      within(canvasElement.ownerDocument.body).getByRole("dialog", { name: args.title }),
    ).toBeVisible(),
  );
};

/** A bounded task with persistent actions: the representative centered dialog. */
export const CenteredWithActions: Story = {
  args: { children: guidanceWithActions },
  play: opensDialog,
};

const EvidenceSections = () => (
  <div>
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
      <DialogSection key={title} title={title}>
        <p>{description}</p>
      </DialogSection>
    ))}
  </div>
);

/** Sustained reading: `reading` content with sections, a persistent title, and actions. */
export const CenteredReading: Story = {
  args: {
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
  play: opensDialog,
};

/** Records related to a row, in a full-height panel at the end edge. */
export const SidePanel: Story = {
  ...CenteredReading,
  render: (args) => <SidePanelFrame {...args} />,
};

/** Reference material beside a value, dismissed with Escape or the close control. */
export const Popover: Story = {
  args: {
    title: "An example dialog",
    children: (
      <Text as="p" variant="supporting">
        Nothing will be published or changed in the funding round. Escape closes this dialog and
        returns focus to its trigger.
      </Text>
    ),
  },
  render: (args) => <PopoverExample {...args} />,
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

/** The popover keeps its heading and close control visible while long content scrolls. */
export const PopoverLongContent: Story = {
  args: {
    title: CenteredReading.args!.title,
    children: <EvidenceSections />,
  },
  render: (args) => <PopoverExample {...args} />,
  play: opensDialog,
};

const statuses = ["Draft", "Ready for review", "Approved"];

const PickerExample = () => {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState(statuses[0]);
  return (
    <PickerPopover
      title="Choose a status"
      placement="bottom start"
      isOpen={open}
      onOpenChange={setOpen}
      trigger={<Button variant="secondary">Status: {status}</Button>}
    >
      <ChoiceList
        label="Status"
        searchLabel="Change status…"
        emptyLabel="No matching status"
        items={statuses.map((option) => ({ id: option, label: option }))}
        selectedKey={status ?? null}
        onChoose={(option) => {
          setStatus(option);
          setOpen(false);
        }}
      />
    </PickerPopover>
  );
};

export const Picker: Story = {
  render: () => <PickerExample />,
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "Choose a status",
    });

    await expect(within(dialog).queryByRole("heading")).not.toBeInTheDocument();
    await expect(within(dialog).queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: "Change status…" })).toHaveFocus(),
    );
  },
};

const reviewers = Array.from({ length: 14 }, (_, index) => ({
  id: `reviewer-${index}`,
  label: `Reviewer ${index + 1}`,
}));

const PickerWithNotesExample = () => {
  const [reviewer, setReviewer] = useState<string | null>(null);
  return (
    <PickerPopover
      title="Request a review"
      placement="bottom start"
      isOpen
      trigger={<Button variant="secondary">Request review</Button>}
    >
      <div>
        <Text as="p" variant="caption">
          Choose a reviewer to record a request. No message is sent.
        </Text>
        <ChoiceList
          label="Reviewer"
          searchLabel="Find a reviewer"
          emptyLabel="No matching reviewer"
          items={reviewers}
          selectedKey={reviewer}
          onChoose={setReviewer}
          actions={[{ id: "add", label: "Add reviewer", icon: "add", onAction: () => undefined }]}
        />
      </div>
    </PickerPopover>
  );
};

/** A long list with a note above it: the picker is the one scroller, with its scrollbar at the edge. */
export const PickerWithNotes: Story = {
  render: () => <PickerWithNotesExample />,
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "Request a review",
    });
    await waitFor(() => expect(within(dialog).getByRole("textbox")).toHaveFocus());
  },
};

/** Tab moves through the close control, the scrollable body, and actions without leaving. */
export const KeyboardFocusContained: Story = {
  args: { children: guidanceWithActions },
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
    await expect(close).toHaveAttribute("data-focus-visible", "true");

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

/** Backdrop presses leave the dialog open; Escape and the close control still dismiss it. */
export const BackdropDismissalDisabled: Story = {
  args: {
    isDismissable: false,
    title: "An example dialog",
    children: (
      <DialogContent>
        <Text as="p" variant="supporting">
          Clicking the shaded backdrop leaves this dialog open. Press Escape or use the close button
          to close it. Focus returns to the Open dialog button.
        </Text>
      </DialogContent>
    ),
  },
  play: opensDialog,
};
