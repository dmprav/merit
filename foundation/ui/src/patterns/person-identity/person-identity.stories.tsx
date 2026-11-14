import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge } from "../../components/badge/badge";
import linkStyles from "../../components/link/link.module.css";
import { PersonIdentity } from "./person-identity";
import styles from "./person-identity.stories.module.css";

const meta = {
  title: "Patterns/Person identity",
  tags: ["!autodocs"],
  component: PersonIdentity,
  args: { name: "Dana Reed" },
} satisfies Meta<typeof PersonIdentity>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Compact: Story = {};
export const WithDescription: Story = { args: { description: "Program manager" } };
export const CurrentPerson: Story = {
  args: { description: "dana@example.test", annotation: "You" },
};
export const DisabledAccount: Story = {
  args: {
    name: "Morgan Lee",
    description: "morgan@example.test",
    status: <Badge tone="danger">Account disabled</Badge>,
  },
};

export const Reviewer: Story = {
  args: {
    name: "Sam Patel",
    nameAs: "h3",
    description: (
      <>
        <span>4 November 2026 · Application v1</span>
        <Badge tone="warning">Outdated</Badge>
      </>
    ),
  },
};
export const Linked: Story = {
  render: (args) => (
    <a href="#person-profile" className={linkStyles.text}>
      <PersonIdentity {...args} />
    </a>
  ),
};
export const LongName: Story = {
  args: {
    name: "Alexandria Montgomery-Worthington",
    description: "Programme manager for community partnerships and development",
  },
  decorators: [
    (Story) => (
      <div className={styles.narrow}>
        <Story />
      </div>
    ),
  ],
};
export const PageHeading: Story = {
  render: (args) => (
    <h1>
      <PersonIdentity {...args} />
    </h1>
  ),
};

export const CompactLongName: Story = {
  args: { name: "Alexandria Montgomery-Worthington" },
  decorators: [
    (Story) => (
      <div className={styles.narrow}>
        <Story />
      </div>
    ),
  ],
};
