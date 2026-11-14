import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { Button } from "@merit/ui/button";
import { ModalDialog } from "@merit/ui/dialog";

import { Form, FormActions, FormDialog, FormSelect, FormTextField, useForm } from "../index";

const Example = ({
  size = "wide",
  save,
  children,
}: {
  size?: "default" | "wide";
  save: (values: { title: string }) => Promise<string | null>;
  children?: ReactNode;
}) => {
  const { form, submission } = useForm({
    defaultValues: { title: "" },
    schema: z.object({ title: z.string().min(1, "Enter a title.") }),
    onSubmit: save,
    submitErrorMessage: "Could not save.",
  });
  return (
    <FormDialog
      title="Write a review"
      closeLabel="Close editor"
      size={size}
      trigger={<Button>Write</Button>}
      isDismissDisabled={submission.isSubmitting}
    >
      <Form
        label="Review"
        submission={submission}
        actions={
          <FormActions
            submission={submission}
            onCancel={() => {}}
            cancelLabel="Close"
            submitLabel="Save"
            submittingLabel="Saving…"
          />
        }
      >
        <form.Field name="title">
          {(field) => <FormTextField field={field} label="Title" multiline />}
        </form.Field>
        {children}
      </Form>
    </FormDialog>
  );
};

it.each(["default", "wide"] as const)(
  "validates and submits a %s dialog from the keyboard without form layout configuration",
  async (size) => {
    const user = userEvent.setup();
    const save = vi.fn(async () => null);
    render(<Example size={size} save={save} />);
    await user.click(screen.getByRole("button", { name: "Write" }));
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.click(title);
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveAccessibleDescription("Enter a title.");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Review" })).toHaveAttribute("tabindex", "0");

    await user.type(title, "Useful evidence");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({ title: "Useful evidence" }));
  },
);

it("keeps a pending dialog open and preserves the draft and recovery after failure", async () => {
  const user = userEvent.setup();

  let finish = (_error: string | null) => {};

  const save = () =>
    new Promise<string | null>((resolve) => {
      finish = resolve;
    });

  render(<Example save={save} />);
  const trigger = screen.getByRole("button", { name: "Write" });
  await user.click(trigger);
  await user.type(screen.getByRole("textbox"), "Keep this draft");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.keyboard("{Escape}");

  expect(screen.getByRole("dialog", { name: "Write a review" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Close editor" })).toBeDisabled();
  expect(screen.getByRole("textbox")).toBeDisabled();

  await act(async () => finish("Try again."));

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Try again.");
  expect(alert.closest("[data-dialog-feedback]")).not.toBeNull();
  expect(alert.closest("[data-dialog-footer]")).toBeNull();
  expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");
  await user.click(screen.getByRole("button", { name: "Close editor" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("keeps a portaled child form's layout and submission separate from its parent dialog", async () => {
  const user = userEvent.setup();
  const saveReview = vi.fn(async () => null);
  const saveContact = vi.fn(async () => {});
  render(
    <Example save={saveReview}>
      <ModalDialog
        title="Contact"
        closeLabel="Close contact"
        trigger={<Button>Edit contact</Button>}
      >
        <Form
          label="Contact"
          submission={{ submit: saveContact, isSubmitting: false, error: null }}
          submitOnModEnter
          actions={<Button type="submit">Save contact</Button>}
        >
          <label>
            Name
            <textarea />
          </label>
        </Form>
      </ModalDialog>
    </Example>,
  );
  await user.click(screen.getByRole("button", { name: "Write" }));
  await user.type(screen.getByRole("textbox", { name: "Title" }), "Ready to save");
  await user.click(screen.getByRole("button", { name: "Edit contact" }));

  expect(screen.getByRole("form", { name: "Contact" })).toHaveAttribute(
    "data-appearance",
    "default",
  );
  expect(screen.queryByRole("group", { name: "Contact" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("textbox", { name: "Name" }));
  await user.keyboard("{Control>}{Enter}{/Control}");
  await waitFor(() => expect(saveContact).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole("button", { name: "Save contact" }));
  await waitFor(() => expect(saveContact).toHaveBeenCalledTimes(2));
  expect(saveReview).not.toHaveBeenCalled();
});

const NestedForms = ({
  parentPending,
  childPending,
}: {
  parentPending: boolean;
  childPending: boolean;
}) => {
  const { form, submission } = useForm({
    defaultValues: { parent: "Parent", child: "first", restricted: "first" },
    schema: z.object({ parent: z.string(), child: z.string(), restricted: z.string() }),
    onSubmit: () => null,
    submitErrorMessage: "Could not save.",
  });

  return (
    <Form label="Parent" submission={{ ...submission, isSubmitting: parentPending }} actions={null}>
      <form.Field name="parent">
        {(field) => <FormTextField field={field} label="Parent field" />}
      </form.Field>
      {createPortal(
        <Form
          label="Child"
          submission={{ ...submission, isSubmitting: childPending }}
          actions={null}
        >
          <form.Field name="child">
            {(field) => (
              <FormSelect
                field={field}
                label="Child field"
                items={[{ id: "first", label: "First" }]}
              />
            )}
          </form.Field>
          <form.Field name="restricted">
            {(field) => (
              <FormSelect
                field={field}
                label="Restricted field"
                isDisabled
                items={[{ id: "first", label: "First" }]}
              />
            )}
          </form.Field>
        </Form>,
        document.body,
      )}
    </Form>
  );
};

it("uses the nearest form's pending state and preserves explicit field restrictions", () => {
  const view = render(<NestedForms parentPending childPending={false} />);
  const parent = screen.getByRole("textbox", { name: "Parent field" });
  const child = screen.getByRole("button", { name: /Child field/ });
  const restricted = screen.getByRole("button", { name: /Restricted field/ });

  expect(parent).toBeDisabled();
  expect(child).toBeEnabled();
  expect(restricted).toBeDisabled();

  view.rerender(<NestedForms parentPending={false} childPending />);

  expect(parent).toBeEnabled();
  expect(child).toBeDisabled();
  expect(restricted).toBeDisabled();

  view.rerender(<NestedForms parentPending={false} childPending={false} />);

  expect(child).toBeEnabled();
  expect(restricted).toBeDisabled();
});
