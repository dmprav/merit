import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button/button";
import { Inline } from "../layout/layout";
import { Icon, LoadingIcon } from "./icon";
import { iconNames } from "./icon-base";
import localStyles from "./icon.stories.module.css";

const meta = {
  title: "Components/Icon",
  component: Icon,
  subcomponents: { LoadingIcon },
  args: { name: "home" },
  argTypes: { name: { control: "select", options: iconNames } },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Catalog: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <ul className={localStyles.icons}>
      {iconNames.map((name) => (
        <li key={name} className={localStyles.icon}>
          <Icon name={name} />
          <span>{name}</span>
        </li>
      ))}
    </ul>
  ),
};

export const Playground: Story = {};

export const InControls: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Inline gap={3}>
      <Button variant="secondary">
        <Icon name="edit" />
        Edit recommendation
      </Button>
      <Button variant="quiet" iconOnly aria-label="Next application">
        <Icon name="right" />
      </Button>
      <Button variant="secondary" isDisabled>
        <Icon name="edit" />
        Edit recommendation
      </Button>
      <Button isPending>Saving…</Button>
    </Inline>
  ),
};

export const Loading: Story = {
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "LoadingIcon is the shared spinner for work in progress. It turns steadily and holds still when the person asks for reduced motion. Say what is loading in text beside it.",
      },
    },
  },
  render: () => (
    <Inline gap={3}>
      <LoadingIcon />
      <span>Reading the submission</span>
    </Inline>
  ),
};
