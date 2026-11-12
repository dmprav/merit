import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Select } from "./select";
import localStyles from "./select.stories.module.css";

const items = [
  { id: "fund", label: "Fund" },
  { id: "conditional", label: "Fund with a condition" },
  { id: "unavailable", label: "Unavailable option", isDisabled: true },
  { id: "defer", label: "Defer" },
];
const meta = {
  title: "Components/Select",
  component: Select,
  parameters: {
    docs: {
      description: {
        component:
          "Use Select to choose a field value; the owning form or editing pattern determines when that value is saved. The selected option keeps its tint and checkmark while keyboard focus uses the shared side marker. Long menus scroll with related actions in a separate footer. Use real links for destinations and ActionMenu for commands. See [control selection](?path=/docs/overview--docs#choose-controls-by-outcome) for the related patterns.",
      },
    },
  },
  args: {
    label: "Recommendation",
    items,
    defaultSelectedKey: "fund",
    onSelectionChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className={localStyles.preview}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Required: Story = { args: { isRequired: true } };
export const Empty: Story = {
  args: { defaultSelectedKey: undefined, placeholder: "Choose a recommendation" },
};
export const Disabled: Story = { args: { isDisabled: true } };
export const Invalid: Story = {
  args: { isInvalid: true, errorMessage: "Choose a recommendation before saving." },
};
export const Focused: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();

    await expect(canvas.getByRole("button", { name: /Recommendation/ })).toHaveFocus();
  },
};
export const Open: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Recommendation/ }));

    await waitFor(() => expect(within(document.body).getByRole("listbox")).toBeVisible());
  },
};
export const Keyboard: Story = {
  play: async ({ canvas, userEvent, canvasElement }) => {
    const trigger = canvas.getByRole("button", { name: /Recommendation/ });
    await userEvent.tab();

    await expect(trigger).toHaveFocus();

    await userEvent.keyboard("{Enter}{End}");
    const body = within(canvasElement.ownerDocument.body);

    await expect(body.getByRole("listbox")).toBeVisible();
    await expect(body.getByRole("option", { name: "Defer" })).toHaveFocus();
    await expect(body.getByRole("option", { name: "Fund" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
};
export const Controlled: Story = { render: () => <ControlledSelect /> };
export const LongLabels: Story = {
  args: {
    items: [
      { id: "fund", label: "Fund with a condition that the revised delivery plan is approved" },
      { id: "defer", label: "Defer until the applicant confirms the community venue" },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          "Long selected values truncate in the trigger. Open the menu to read the full, wrapping labels in a narrow field.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className={localStyles.narrow}>
        <Story />
      </div>
    ),
  ],
  play: Open.play,
};

export const LongList: Story = {
  args: {
    label: "Funding round",
    items: Array.from({ length: 24 }, (_, index) => ({
      id: `round-${index}`,
      label: `Community grants ${2026 - index}`,
    })),
    defaultSelectedKey: "round-0",
    actions: [{ id: "add", label: "Add funding round", onAction: fn() }],
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Funding round/ }));
    await waitFor(() =>
      expect(within(canvasElement.ownerDocument.body).getByRole("listbox")).toBeVisible(),
    );
  },
};

const ControlledSelect = () => {
  const [selectedKey, setSelectedKey] = useState("fund");

  return (
    <Select
      label="Recommendation"
      items={items}
      selectedKey={selectedKey}
      onSelectionChange={setSelectedKey}
    />
  );
};

export const WithAction: Story = {
  args: { actions: [{ id: "add", label: "Add another option", onAction: fn() }] },
  play: async ({ canvas, canvasElement, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Recommendation/ }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", { name: "Add another option" }),
    );

    await expect(args.actions![0]!.onAction).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("button", { name: /Recommendation/ })).toHaveTextContent("Fund");
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("listbox"),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Recommendation/ }));
    await expect(within(canvasElement.ownerDocument.body).getByRole("listbox")).toBeVisible();
  },
};
