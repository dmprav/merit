import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import { Calendar } from "./calendar";

const meta = {
  title: "Components/Calendar",
  component: Calendar,
  args: { label: "Date", value: "2027-01-21", onChange: fn() },
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <div style={{ maxWidth: "320px" }}>
          <Story />
        </div>
      </MessagesProvider>
    ),
  ],
  render: (args) => <Example {...args} />,
} satisfies Meta<typeof Calendar>;

export default meta;

type Story = StoryObj<typeof meta>;

const Example = ({ value: initialValue, onChange, ...props }: ComponentProps<typeof Calendar>) => {
  const [value, setValue] = useState(initialValue);
  return (
    <Calendar
      {...props}
      value={value}
      onChange={(date) => {
        setValue(date);
        onChange(date);
      }}
    />
  );
};

export const Default: Story = {};
export const Empty: Story = { args: { value: null } };
export const Disabled: Story = { args: { isDisabled: true } };
