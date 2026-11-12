import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import { z } from "zod";

import { MessagesProvider } from "@merit/i18n";
import { Button } from "@merit/ui/button";

import { FormDateField } from "../fields/date-field";
import { FormSelect } from "../fields/select";
import { FormTextField } from "../fields/text-field";
import { Form, FormActions, FormDialog } from "./form";
import { useForm } from "./use-form";

const FormDialogExample = ({
  size = "wide",
  context,
  long = false,
  withPopups = false,
  outcome = "success",
}: {
  size?: "default" | "wide";
  context?: string;
  long?: boolean;
  withPopups?: boolean;
  outcome?: "success" | "pending" | "failure";
}) => {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(false);
  const { form, submission } = useForm({
    defaultValues: { title: "", notes: "", status: "draft", date: "2027-01-21" },
    schema: z.object({
      title: z.string().trim().min(1, "Enter a title."),
      notes: z.string(),
      status: z.string(),
      date: z.iso.date(),
    }),
    onSubmit: async () => {
      if (outcome === "pending") {
        return new Promise<string | null>(() => {});
      }
      if (outcome === "failure") {
        return "Could not save. Your writing is still here. Try again.";
      }
      setSaved(true);
      setOpen(false);
      return null;
    },
    submitErrorMessage: "Could not save. Try again.",
  });

  return (
    <MessagesProvider messages={{}}>
      {saved && <p role="status">Saved.</p>}
      <FormDialog
        title="Write a note"
        closeLabel="Close editor"
        context={context}
        contextLabel={context ? "Round" : undefined}
        size={size}
        isOpen={open}
        onOpenChange={setOpen}
        isDismissDisabled={submission.isSubmitting}
        trigger={<Button>Write a note</Button>}
      >
        <Form
          label="Note"
          submission={submission}
          actions={
            <FormActions
              submission={submission}
              onCancel={() => setOpen(false)}
              cancelLabel="Close"
              discard={{
                label: "Discard draft",
                onPress: () => {
                  form.reset();
                  setOpen(false);
                },
              }}
              submitLabel="Save note"
              submittingLabel="Saving…"
            />
          }
        >
          <form.Field name="title">
            {(field) => <FormTextField field={field} label="Title" isRequired autoFocus />}
          </form.Field>
          <form.Field name="notes">
            {(field) => (
              <FormTextField field={field} label="Notes" multiline rows={long ? 30 : 5} />
            )}
          </form.Field>
          {withPopups && (
            <>
              <form.Field name="status">
                {(field) => (
                  <FormSelect
                    field={field}
                    label="Status"
                    items={[
                      { id: "draft", label: "Draft" },
                      { id: "ready", label: "Ready" },
                    ]}
                  />
                )}
              </form.Field>
              <form.Field name="date">
                {(field) => <FormDateField field={field} label="Date" />}
              </form.Field>
            </>
          )}
        </Form>
      </FormDialog>
    </MessagesProvider>
  );
};

const meta = {
  title: "Patterns/Form dialog",
  component: FormDialogExample,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof FormDialogExample>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Wide: Story = {};
export const Compact: Story = { args: { size: "default" } };
export const WithContext: Story = { args: { context: "Community grants" } };
export const LongContext: Story = {
  args: {
    context: "Community partnerships for accessible neighbourhood spaces and year-round activities",
  },
};
export const LongContent: Story = { args: { long: true } };
export const PopupFields: Story = { args: { withPopups: true, outcome: "pending" } };
export const RequiredTitle: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(dialog.getByRole("textbox", { name: "Title" })).toHaveFocus());
    await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveAccessibleDescription(
      "Enter a title.",
    );
  },
};
export const Pending: Story = {
  args: { outcome: "pending" },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.type(dialog.getByRole("textbox", { name: "Title" }), "Review preparation");
    await userEvent.click(dialog.getByRole("button", { name: "Save note" }));
    await userEvent.keyboard("{Escape}");
    await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Close editor" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: /^Close$/ })).toBeDisabled();
  },
};
export const Failure: Story = {
  args: { outcome: "failure" },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.type(dialog.getByRole("textbox", { name: "Title" }), "Review preparation");
    await userEvent.click(dialog.getByRole("button", { name: "Save note" }));
    await expect(dialog.getByRole("alert")).toHaveTextContent("Your writing is still here");
    await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue("Review preparation");
  },
};
