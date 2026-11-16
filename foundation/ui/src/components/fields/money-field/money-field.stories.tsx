import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";

import styles from "../field.stories.module.css";
import { MoneyField } from "./money-field";

const EditableAmount = (props: ComponentProps<typeof MoneyField>) => {
  const [value, setValue] = useState(props.value);
  return <MoneyField {...props} value={value} onChange={setValue} />;
};

const meta = {
  title: "Components/Money field",
  component: MoneyField,
  args: {
    label: "Proposed allocation",
    value: "",
    onChange: fn(),
    precisionMessage: "Use numbers with up to two decimal places.",
    prefix: { text: "€", label: "Euros" },
  },
  decorators: [
    (Story) => (
      <div className={styles.preview}>
        <Story />
      </div>
    ),
  ],
  render: (args) => <EditableAmount {...args} />,
} satisfies Meta<typeof MoneyField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const RestoredInvalidAmount: Story = {
  args: { value: "123.456", isInvalid: true, errorMessage: "Enter at most two decimal places." },
};
