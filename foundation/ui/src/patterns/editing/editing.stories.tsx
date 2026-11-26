import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import { PickerPopover } from "../../components/dialog/dialog";
import { Stack } from "../../components/layout/layout";
import { PersonIdentity } from "../person-identity/person-identity";
import { ChoiceList } from "./choice-list";
import { DateChoice } from "./date-choice";
import { EditorClose, EditorLoading } from "./editor-loading";
import { InlineName } from "./inline-name";
import { PropertyButton } from "./property-button";

const saveOutcome = (error: string | null) => fn(async (_value: string) => error);

const onCancelDate = fn();
const onPropertyPress = fn();

const meta = {
  title: "Patterns/Editing",
  component: InlineName,
  subcomponents: { PropertyButton, DateChoice, ChoiceList, EditorLoading, EditorClose },
  tags: ["!autodocs"],
  args: {
    value: "Local Connections 2027",
    label: "Rename round",
    saveLabel: "Save name",
    cancelLabel: "Cancel",
    errorMessage: "Could not save. Your name is still here.",
    onSave: saveOutcome(null),
  },
  argTypes: { value: { control: false } },
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

export const PropertyButtonStates: Story = {
  name: "Property button states",
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={3}>
      <PropertyButton action="edit" label="Edit budget: €120,000" onPress={onPropertyPress}>
        €120,000
      </PropertyButton>
      <PropertyButton
        action="edit"
        draftLabel="Unsaved changes"
        label="Resume budget: €120,000"
        onPress={onPropertyPress}
      >
        €120,000
      </PropertyButton>
      <PropertyButton action="edit" label="Edit budget: €120,000" isDisabled>
        €120,000
      </PropertyButton>
    </Stack>
  ),
};

const PersonPropertyExample = () => {
  const [name, setName] = useState("Dana Reed");
  const [open, setOpen] = useState(false);
  return (
    <PickerPopover
      title="Change contact"
      placement="bottom start"
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
        onChoose={(next) => {
          setName(next);
          setOpen(false);
        }}
      />
    </PickerPopover>
  );
};

export const PropertyButtonPerson: Story = {
  name: "Property button picker",
  parameters: { controls: { disable: true } },
  render: () => <PersonPropertyExample />,
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

export const PropertyButtonLongName: Story = {
  name: "Property button long name",
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ maxWidth: "200px" }}>
      <PropertyButton
        action="choose"
        label="Change contact: Alexandra Montgomery-Wellington"
        onPress={onPropertyPress}
      >
        <PersonIdentity name="Alexandra Montgomery-Wellington" />
      </PropertyButton>
    </div>
  ),
};

export const DateChoiceEditor: Story = {
  name: "Date choice",
  parameters: { controls: { disable: true } },
  render: function Render() {
    const [date, setDate] = useState<string | null>("2027-01-21");
    return (
      <DateChoice
        applyLabel="Apply date"
        cancelLabel="Cancel"
        onCancel={onCancelDate}
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
  parameters: { controls: { disable: true } },
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

export const RestoringDraft: Story = {
  name: "Restoring draft",
  parameters: { controls: { disable: true } },
  render: () => (
    <Stack gap={4}>
      <EditorLoading />
      <EditorClose label="Close" onClose={onCancelDate} />
    </Stack>
  ),
};
