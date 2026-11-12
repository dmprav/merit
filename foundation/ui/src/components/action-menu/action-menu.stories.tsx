import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { ActionMenu } from "./action-menu";

const meta = {
  title: "Components/Action menu",
  component: ActionMenu,
  parameters: {
    docs: {
      description: {
        component:
          "Use ActionMenu for secondary commands; keep important actions in visibly labeled buttons. Items invoke callbacks. Use real links for destinations and Select for field values. See [control selection](?path=/docs/overview--docs#choose-controls-by-outcome) for the related patterns.",
      },
    },
  },
  args: {
    label: "More actions",
    trigger: (
      <Button size="small" variant="quiet" iconOnly aria-label="More actions">
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
