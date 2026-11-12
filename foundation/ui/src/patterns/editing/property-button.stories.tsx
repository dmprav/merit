import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, waitFor, within } from "storybook/test";

import { PopoverDialog } from "../../components/dialog/dialog";
import { PersonIdentity } from "../person-identity/person-identity";
import { ChoiceList } from "./choice-list";
import { PropertyButton } from "./property-button";

const meta = {
  title: "Patterns/Property button",
  component: PropertyButton,
  args: { action: "edit", label: "Edit budget: €120,000", children: "€120,000" },
} satisfies Meta<typeof PropertyButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Budget: Story = {};
export const Draft: Story = {
  args: { draftLabel: "Unsaved changes", label: "Resume budget: €120,000" },
};
export const Disabled: Story = { args: { isDisabled: true } };
export const LongName: Story = {
  args: {
    action: "choose",
    label: "Change contact: Alexandra Montgomery-Wellington",
    children: <PersonIdentity name="Alexandra Montgomery-Wellington" />,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "200px" }}>
        <Story />
      </div>
    ),
  ],
};

const PersonExample = () => {
  const [name, setName] = useState("Dana Reed");
  const [open, setOpen] = useState(false);
  return (
    <PopoverDialog
      title="Change contact"
      closeLabel="Close contact picker"
      isOpen={open}
      onOpenChange={setOpen}
      trigger={
        <PropertyButton action="choose" label={`Change contact: ${name}`}>
          <PersonIdentity name={name} />
        </PropertyButton>
      }
    >
      <ChoiceList
        label="Contact"
        searchLabel="Search contacts"
        emptyLabel="No contacts"
        selectedKey={name}
        items={[
          { id: "Dana Reed", label: "Dana Reed" },
          { id: "Leah Martin", label: "Leah Martin" },
        ]}
        onChoose={(name) => {
          setName(name);
          setOpen(false);
        }}
      />
    </PopoverDialog>
  );
};

export const Person: Story = {
  render: () => <PersonExample />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Change contact: Dana Reed" });
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("option", { name: "Leah Martin" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveAccessibleName("Change contact: Leah Martin");
  },
};
