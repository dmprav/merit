import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { ActionMenu } from "./action-menu";

const meta = {
  title: "Components/Action menu",
  component: ActionMenu,
  args: {
    label: "More actions",
    trigger: (
      <Button variant="quiet" iconOnly aria-label="More actions">
        <Icon name="more" />
      </Button>
    ),
    items: [{ id: "reset", label: "Reset demo" }],
    onAction: fn(),
  },
} satisfies Meta<typeof ActionMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Keyboard: Story = {
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    await expect(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", { name: "Reset demo" }),
    ).toHaveFocus();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(canvas.getByRole("button", { name: "More actions" })).toHaveFocus());

    await userEvent.keyboard("{Enter}");
  },
};

export const ContextMenu: Story = {
  args: {
    activation: "contextMenu",
    tooltip: "Community grants · Alder Foundation",
    trigger: <a href="#community-grants">Community grants</a>,
    items: [
      { id: "up", label: "Move up" },
      { id: "unpin", label: "Unpin" },
    ],
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const link = canvas.getByRole("link", { name: "Community grants" });
    link.focus();
    await userEvent.pointer({ keys: "[MouseRight]", target: link });
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("menuitem", { name: "Move up" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(link).toHaveFocus());
  },
};
