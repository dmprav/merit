import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";

import styles from "../field.stories.module.css";
import { MoneyField } from "./money-field";

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
  // The story owns the draft; `value` only sets where it starts.
  argTypes: { value: { control: false } },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return (
      <MoneyField
        {...args}
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    );
  },
} satisfies Meta<typeof MoneyField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const RestoredInvalidAmount: Story = {
  args: { value: "123.456", isInvalid: true, errorMessage: "Enter at most two decimal places." },
};
