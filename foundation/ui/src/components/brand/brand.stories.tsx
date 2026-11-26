import type { Meta, StoryObj } from "@storybook/react-vite";

import { Link } from "../link/link";
import { Brand } from "./brand";

const meta = {
  title: "Components/Brand",
  component: Brand,
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof Brand>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The containing link owns navigation and supplies the accessible name. */
export const InLink: Story = {
  render: () => (
    <Link href="#home" aria-label="Merit home">
      <Brand />
    </Link>
  ),
};
