import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button/button";
import { Icon } from "./icon";
import localStyles from "./icon.stories.module.css";

const meta = {
  title: "Components/Icon",
  component: Icon,
  parameters: {
    docs: {
      description: {
        component: `Use Icon for interface symbols. Its Lucide glyphs share a 16 px size,
1.75 stroke width, normal stroke scaling, and the surrounding text color. Extend
the explicitly imported set as needed; use className for placement or motion to
keep size and stroke consistent across controls.

Icons reinforce labels and are hidden from assistive technology. Give icon-only
controls an accessible name from the message catalogs and a target larger than the
glyph. Express status meaning in text as well.`,
      },
    },
  },
  args: { name: "home" },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Catalog: Story = {
  render: () => (
    <ul className={localStyles.icons}>
      {(
        [
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
