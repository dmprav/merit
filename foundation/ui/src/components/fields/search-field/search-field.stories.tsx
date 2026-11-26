import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import fieldStyles from "../field.stories.module.css";
import { SearchField } from "./search-field";

const meta = {
  title: "Components/Search field",
  component: SearchField,
  args: {
    label: "Search applications",
    clearLabel: "Clear search",
    placeholder: "Application or applicant",
    value: "",
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className={fieldStyles.preview}>
        <Story />
      </div>
    ),
  ],
  // The story owns the draft; `value` only sets where it starts.
  argTypes: { value: { control: false } },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return (
      <SearchField
        {...args}
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    );
  },
} satisfies Meta<typeof SearchField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Populated: Story = { args: { value: "Neighbourhood" } };
export const Disabled: Story = { args: { ...Populated.args, isDisabled: true } };
export const Clearing: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("searchbox", { name: "Search applications" });
    await userEvent.type(input, "Neighbourhood");
    await userEvent.tab();
    const clear = canvas.getByRole("button", { name: "Clear search" });
    await expect(clear).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(input).toHaveValue("");
    await expect(input).toHaveFocus();
    await expect(canvas.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    await userEvent.type(input, "Neighbourhood");
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Clear search" })).toHaveFocus();
  },
};
