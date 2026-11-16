import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect } from "storybook/test";

import fieldStyles from "../field.stories.module.css";
import { SearchField } from "./search-field";

const Example = ({ initialValue = "", isDisabled = false }) => {
  const [value, onChange] = useState(initialValue);
  return (
    <SearchField
      label="Search applications"
      clearLabel="Clear search"
      placeholder="Application or applicant"
      value={value}
      onChange={onChange}
      isDisabled={isDisabled}
    />
  );
};

const meta = {
  title: "Components/Search field",
  component: Example,
  decorators: [
    (Story) => (
      <div className={fieldStyles.preview}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Example>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Populated: Story = { args: { initialValue: "Neighbourhood" } };
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
  },
};
