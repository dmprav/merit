import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Form } from "react-aria-components/Form";
import { expect } from "storybook/test";

import { Button } from "../../button/button";
import styles from "../field.stories.module.css";
import { TextField } from "./text-field";
import localStyles from "./text-field.stories.module.css";

const meta = {
  title: "Components/Text field",
  component: TextField,
  args: { label: "Display name", description: "Use the name your colleagues recognize." },
  decorators: [
    (Story) => (
      <div className={styles.preview}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { placeholder: "Alex Morgan" } };
export const Prefix: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Use a prefix for a fixed unit beside the editable value. Its label is announced with field guidance; the prefix is never part of the value. Prefixes apply only to single-line inputs.",
      },
    },
  },
  render: () => (
    <div className={styles.examples}>
      {[
        { title: "Empty", defaultValue: "" },
        { title: "Editable", defaultValue: "20000.00" },
        {
          title: "Invalid",
          defaultValue: "20.001",
          isInvalid: true,
          errorMessage: "Enter at most two decimal places.",
        },
        { title: "Read-only", defaultValue: "20000.00", isReadOnly: true },
        { title: "Disabled", defaultValue: "0.00", isDisabled: true },
      ].map(({ title, ...state }) => (
        <section key={title} aria-label={title}>
          <h2 className={styles.groupTitle}>{title}</h2>
          <TextField
            label="Proposed allocation"
            prefix={{ text: "€", label: "Euros" }}
            inputMode="decimal"
            {...state}
          />
        </section>
      ))}
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getAllByRole("textbox", { name: "Proposed allocation" })[0]!;
    await userEvent.click(input);
    await userEvent.type(input, "1250.50");

    await expect(input).toHaveValue("1250.50");
    await expect(input).toHaveAccessibleDescription("Euros");
    await expect(input).toHaveFocus();
  },
};
export const States: Story = {
  parameters: {
    docs: {
      description: {
        story: `Required editable fields show a quiet “Required” label; error styling marks
validation failures. Set isRequired to declare the requirement.

Read-only fields keep readable text, keyboard focus, and selection for copying,
with a quieter surface and no editing hover emphasis. Disabled fields use subdued
text. Both omit the visible required marker; the underlying requirement still applies.`,
      },
    },
  },
  render: () => (
    <div className={styles.examples}>
      {[
        { title: "Editable" },
        { title: "Required", isRequired: true },
        {
          title: "Invalid",
          defaultValue: "A",
          isInvalid: true,
          errorMessage: "Use at least two characters.",
        },
        { title: "Read-only", isReadOnly: true },
        { title: "Disabled", isDisabled: true },
      ].map(({ title, ...state }) => (
        <section key={title} aria-label={title}>
          <h2 className={styles.groupTitle}>{title}</h2>
          <TextField label="Display name" defaultValue="Alex Morgan" {...state} />
        </section>
      ))}
    </div>
  ),
};

export const Focused: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Display name" });
    input.focus();

    await expect(input).toHaveFocus();
  },
};
export const Multiline: Story = {
  render: () => (
    <div className={styles.examples}>
      {[
        { title: "Editable", isReadOnly: false },
        { title: "Read-only", isReadOnly: true },
      ].map(({ title, isReadOnly }) => (
        <section key={title} aria-label={title}>
          <h2 className={styles.groupTitle}>{title}</h2>
          <TextField
            label="Summary"
            defaultValue="A community-led programme expanding access to local arts and culture."
            multiline
            isReadOnly={isReadOnly}
          />
        </section>
      ))}
    </div>
  ),
};

export const Validation: Story = { render: () => <ValidatedForm /> };

export const LongContent: Story = {
  render: () => (
    <div className={localStyles.fields}>
      <TextField
        label="Name of the organization responsible for delivering the programme"
        defaultValue="Northside Community Arts and Cultural Partnerships"
        isRequired
        description="Use the organization's registered name."
      />
      <TextField
        label="Contact email"
        defaultValue="partnerships@northsidecommunityarts.example.org"
        type="email"
        isInvalid
        errorMessage="Check partnerships@northsidecommunityarts.example.org with the applicant."
      />
      <TextField
        label="Project website"
        prefix={{ text: "https://", label: "Secure website address" }}
        defaultValue="northsidecommunityarts.example.org/programmes"
        description="For example: northsidecommunityarts.example.org/programmes"
      />
      <TextField
        label="Summary"
        defaultValue="A community-led programme expanding access to local arts and culture."
        multiline
        rows={2}
      />
    </div>
  ),
};

const ValidatedForm = () => {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");

  return (
    <Form
      className={localStyles.fields}
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(name.trim());
      }}
    >
      <TextField
        label="Display name"
        name="displayName"
        value={name}
        onChange={setName}
        isRequired
        validate={(value) =>
          !value.trim()
            ? "Enter a display name."
            : value.trim().length < 2
              ? "Use at least two characters."
              : null
        }
        errorMessage={({ validationDetails, validationErrors }) =>
          validationDetails.valueMissing ? "Enter a display name." : validationErrors.join(" ")
        }
        description="Use the name your colleagues recognize."
      />
      <Button type="submit">Save preview</Button>
      <p role="status" className={localStyles.status}>
        {saved ? `Preview saved for ${saved}.` : ""}
      </p>
    </Form>
  );
};
