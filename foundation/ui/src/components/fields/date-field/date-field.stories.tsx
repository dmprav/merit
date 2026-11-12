import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, waitFor, within } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import styles from "../field.stories.module.css";
import { DateField } from "./date-field";

const Example = (props: Partial<ComponentProps<typeof DateField>>) => {
  const [value, setValue] = useState("2027-01-21");
  return <DateField label="Committee date" value={value} onChange={setValue} {...props} />;
};

const meta = {
  title: "Components/Date field",
  component: Example,
  decorators: [
    (Story) => (
      <MessagesProvider messages={{}}>
        <div className={styles.preview}>
          <Story />
        </div>
      </MessagesProvider>
    ),
  ],
  render: () => <Example />,
} satisfies Meta<typeof Example>;

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
  render: () => (
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
          <Example {...props} />
        </section>
      ))}
    </div>
  ),
};
