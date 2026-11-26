import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import styles from "../field.stories.module.css";
import { DateField } from "./date-field";

// Each compared state keeps its own draft.
const EditableDate = (props: ComponentProps<typeof DateField>) => {
  const [value, setValue] = useState(props.value);
  return (
    <DateField
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange(next);
      }}
    />
  );
};

const meta = {
  title: "Components/Date field",
  component: DateField,
  tags: ["!autodocs"],
  args: { label: "Committee date", value: "2027-01-21", onChange: fn() },
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <div className={styles.preview}>
          <Story />
        </div>
      </MessagesProvider>
    ),
  ],
  // The story owns the draft; `value` only sets where it starts.
  argTypes: { value: { control: false } },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return (
      <DateField
        {...args}
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    );
  },
} satisfies Meta<typeof DateField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const CalendarOpen: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Choose date for Committee date" }));
    const dialog = within(canvas.getByRole("textbox").ownerDocument.body).getByRole("dialog");
    await waitFor(() => expect(dialog).toBeVisible());
  },
};
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div className={styles.examples}>
      {[
        { title: "Empty", value: "" },
        { title: "Required", isRequired: true },
        { title: "Incomplete", value: "2027-02-" },
        {
          title: "Invalid",
          value: "2027-02-31",
          isInvalid: true,
          errorMessage: "Enter a valid date in YYYY-MM-DD format.",
        },
        { title: "Read-only", isReadOnly: true },
        { title: "Disabled", isDisabled: true },
      ].map(({ title, ...props }) => (
        <section key={title} aria-label={title}>
          <h2 className={styles.groupTitle}>{title}</h2>
          <EditableDate {...args} {...props} />
        </section>
      ))}
    </div>
  ),
};
