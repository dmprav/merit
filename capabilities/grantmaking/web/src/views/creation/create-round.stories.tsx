import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ComposerPreview } from "../../testing/creation-preview";

const meta = {
  title: "Features/Funding rounds/Create",
  tags: ["!autodocs"],
  component: ComposerPreview,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ComposerPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

const openCreation: NonNullable<Story["play"]> = async ({ canvas, canvasElement }) => {
  await userEvent.click(canvas.getByRole("button", { name: "Create funding round" }));
  await waitFor(() =>
    expect(within(canvasElement.ownerDocument.body).getByRole("dialog")).toBeVisible(),
  );
};

export const Default: Story = { play: openCreation };
export const FailedCreation: Story = {
  args: { failure: true },
  play: async (context) => {
    await openCreation(context);
    const { canvasElement } = context;
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.type(dialog.getByRole("textbox", { name: "Round name" }), "Community grants");
    await userEvent.click(dialog.getByRole("button", { name: "Create funding round" }));

    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Round name" })).toHaveValue(
      "Community grants",
    );
  },
};

export const RequiredTitle: Story = {
  play: async (context) => {
    await openCreation(context);
    const { canvasElement } = context;
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Create funding round" }));

    await expect(dialog.getByRole("textbox", { name: "Round name" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};
export const Creating: Story = {
  args: { pending: true },
  play: async (context) => {
    await openCreation(context);
    const { canvasElement } = context;
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.type(dialog.getByRole("textbox", { name: "Round name" }), "Community grants");
    await userEvent.click(dialog.getByRole("button", { name: "Create funding round" }));

    await expect(dialog.getByRole("button", { name: "Creating…" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect(dialog.getByRole("form")).toBeVisible();
    for (const close of dialog.getAllByRole("button", { name: "Close" })) {
      await expect(close).toBeDisabled();
    }
  },
};

export const ResumeDraft: Story = {
  play: async (context) => {
    await openCreation(context);
    const page = within(context.canvasElement.ownerDocument.body);
    let dialog = within(page.getByRole("dialog"));
    await userEvent.type(dialog.getByRole("textbox", { name: "Round name" }), "Community grants");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(context.canvas.getByRole("button", { name: "Resume funding round" }));
    dialog = within(page.getByRole("dialog"));
    await expect(dialog.getByRole("textbox", { name: "Round name" })).toHaveValue(
      "Community grants",
    );
  },
};

export const DiscardDraft: Story = {
  play: async (context) => {
    await ResumeDraft.play!(context);
    const page = within(context.canvasElement.ownerDocument.body);
    await userEvent.click(
      within(page.getByRole("dialog")).getByRole("button", { name: "Discard draft" }),
    );
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await openCreation(context);
    await expect(
      within(page.getByRole("dialog")).getByRole("textbox", { name: "Round name" }),
    ).toHaveValue("");
  },
};
