import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import { ChoiceList } from "./choice-list";
import { DateChoice } from "./date-choice";
import { InlineName } from "./inline-name";

const saveOutcome = (error: string | null) => fn(async (_value: string) => error);

const meta = {
  title: "Patterns/Editing",
  component: InlineName,
  subcomponents: { DateChoice, ChoiceList },
  tags: ["!autodocs"],
  args: {
    value: "Local Connections 2027",
    label: "Rename round",
    saveLabel: "Save name",
    cancelLabel: "Cancel",
    errorMessage: "Could not save. Your name is still here.",
    onSave: saveOutcome(null),
  },
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <div style={{ maxWidth: "360px" }}>
          <Story />
        </div>
      </MessagesProvider>
    ),
  ],
  render: function Render(args) {
    const [name, setName] = useState(args.value);
    return (
      <h1>
        <InlineName
          {...args}
          value={name}
          onSave={async (value) => {
            const error = await args.onSave(value);
            if (!error) {
              setName(value);
            }
            return error;
          }}
        />
      </h1>
    );
  },
} satisfies Meta<typeof InlineName>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InlineNameEditor: Story = {
  name: "Inline name",
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Local Connections 2027" }));

    await expect(canvas.getByRole("textbox", { name: "Rename round" })).toHaveFocus();
  },
};
export const InlineNameSaveFailure: Story = {
  args: { onSave: saveOutcome("Could not save. Your name is still here.") },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Local Connections 2027" }));
    await userEvent.type(canvas.getByRole("textbox"), " updated{Enter}");

    await expect(canvas.getByRole("alert")).toBeVisible();
  },
};
export const DateChoiceEditor: Story = {
  name: "Date choice",
  render: function Render() {
    const [date, setDate] = useState<string | null>("2027-01-21");
    return (
      <DateChoice
        applyLabel="Apply date"
        cancelLabel="Cancel"
        onCancel={() => {}}
        value={date}
        label="Committee date"
        clearLabel="Clear date"
        invalidMessage="Enter a valid date in YYYY-MM-DD format."
        onChoose={setDate}
      />
    );
  },
};
export const ChoiceListPicker: Story = {
  name: "Choice list",
  render: function Render() {
    const [person, setPerson] = useState<string | null>("dana");
    return (
      <ChoiceList
        label="Manager"
        searchLabel="Search people"
        emptyLabel="No matching people"
        selectedKey={person}
        onChoose={setPerson}
        items={[
          { id: "dana", label: "Dana Reed", description: "dana@example.test" },
          { id: "leah", label: "Leah Martin", description: "leah@example.test" },
        ]}
      />
    );
  },
};
