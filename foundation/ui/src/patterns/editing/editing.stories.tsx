import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import { ChoiceList } from "./choice-list";
import { DateChoice } from "./date-choice";
import { InlineName } from "./inline-name";

const EditingExample = ({
  kind = "name",
  fail = false,
}: {
  kind?: "name" | "date" | "person";
  fail?: boolean;
}) => {
  const [name, setName] = useState("Local Connections 2027");
  const [date, setDate] = useState<string | null>("2027-01-21");
  const [person, setPerson] = useState<string | null>("dana");
  if (kind === "date") {
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
  }
  if (kind === "person") {
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
  }

  return (
    <h1>
      <InlineName
        value={name}
        label="Rename round"
        saveLabel="Save name"
        cancelLabel="Cancel"
        errorMessage="Could not save. Your name is still here."
        onSave={async (value) => {
          if (fail) {
            return "Could not save. Your name is still here.";
          }
          setName(value);
          return null;
        }}
      />
    </h1>
  );
};

const meta = {
  title: "Patterns/Editing",
  component: EditingExample,
  tags: ["!autodocs"],
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <div style={{ maxWidth: "360px" }}>
          <Story />
        </div>
      </MessagesProvider>
    ),
  ],
} satisfies Meta<typeof EditingExample>;

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
  args: { fail: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Local Connections 2027" }));
    await userEvent.type(canvas.getByRole("textbox"), " updated{Enter}");

    await expect(canvas.getByRole("alert")).toBeVisible();
  },
};
export const DateChoiceEditor: Story = { name: "Date choice", args: { kind: "date" } };
export const ChoiceListPicker: Story = { name: "Choice list", args: { kind: "person" } };
