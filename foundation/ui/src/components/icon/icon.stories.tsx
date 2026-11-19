import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button/button";
import { Icon } from "./icon";
import localStyles from "./icon.stories.module.css";

const meta = {
  title: "Components/Icon",
  component: Icon,
  args: { name: "home" },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Catalog: Story = {
  render: () => (
    <ul className={localStyles.icons}>
      {(
        [
          "warning",
          "info",
          "clock",
          "pin",
          "pinned",
          "home",
          "layers",
          "round",
          "contacts",
          "team",
          "left",
          "right",
          "down",
          "check",
          "arrow",
          "forward",
          "edit",
          "loading",
          "close",
        ] as const
      ).map((name) => (
        <li key={name} className={localStyles.icon}>
          <Icon name={name} />
          <span>{name}</span>
        </li>
      ))}
    </ul>
  ),
};

export const InControls: Story = {
  render: () => (
    <div className={localStyles.actions}>
      <Button variant="secondary">
        <Icon name="edit" />
        Edit recommendation
      </Button>
      <Button variant="quiet" aria-label="Next application">
        <Icon name="right" />
      </Button>
      <Button variant="secondary" isDisabled>
        <Icon name="edit" />
        Edit recommendation
      </Button>
      <Button isPending>Saving…</Button>
    </div>
  ),
};
