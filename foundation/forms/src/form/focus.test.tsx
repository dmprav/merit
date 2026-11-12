import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { Form, FormSelect, FormTextField, useForm } from "../index";

type FieldName = "title" | "position";

const Example = ({
  first,
  disabled,
  onSubmit,
}: {
  first: FieldName;
  disabled?: FieldName;
  onSubmit: (values: { title: string; position: string }) => null;
}) => {
  const { form, submission } = useForm({
    defaultValues: { title: "", position: "fund" },
    schema: z.object({
      title: z.string().min(1, "Enter a title."),
      position: z.literal("defer", { error: "Choose Defer." }),
    }),
    onSubmit,
    submitErrorMessage: "Could not save.",
  });

  const order: FieldName[] = first === "title" ? ["title", "position"] : ["position", "title"];

  return (
    <Form
      label="Mixed fields"
      submission={submission}
      actions={<button type="submit">Save</button>}
    >
      {order.map((name) => (
        <form.Field key={name} name={name}>
          {(field) =>
            name === "title" ? (
              <FormTextField field={field} label="Title" isDisabled={disabled === name} />
            ) : (
              <FormSelect
                field={field}
                label="Position"
                isDisabled={disabled === name}
                items={[
                  { id: "fund", label: "Fund" },
                  { id: "defer", label: "Defer" },
                ]}
              />
            )
          }
        </form.Field>
      ))}
    </Form>
  );
};

it.each(["title", "position"] as const)(
  "focuses mixed fields in DOM order with %s first, then advances after correction",
  async (first) => {
    const user = userEvent.setup();
    const save = vi.fn(() => null);
    render(<Example first={first} onSubmit={save} />);
    const title = screen.getByRole("textbox", { name: "Title" });
    const position = screen.getByRole("button", { name: /Position/ });
    const firstControl = first === "title" ? title : position;
    const nextControl = first === "title" ? position : title;
    const submit = screen.getByRole("button", { name: "Save" });

    await user.click(submit);

    await waitFor(() => expect(firstControl).toHaveFocus());
    expect(title).toHaveAccessibleDescription("Enter a title.");
    expect(position).toHaveAccessibleDescription("Choose Defer.");
    expect(save).not.toHaveBeenCalled();

    await user.click(submit);

    await waitFor(() => expect(firstControl).toHaveFocus());

    if (first === "title") {
      await user.type(title, "A grant");
    } else {
      await user.keyboard("{Enter}{End}{Enter}");
    }

    await user.click(submit);

    await waitFor(() => expect(nextControl).toHaveFocus());

    if (first === "title") {
      await user.keyboard("{Enter}{End}{Enter}");
    } else {
      await user.type(title, "A grant");
    }

    await user.click(submit);

    expect(save).toHaveBeenCalledExactlyOnceWith({ title: "A grant", position: "defer" });
  },
);

it.each(["title", "position"] as const)(
  "skips an earlier disabled invalid %s field",
  async (first) => {
    const user = userEvent.setup();
    const save = vi.fn(() => null);
    render(<Example first={first} disabled={first} onSubmit={save} />);
    const title = screen.getByRole("textbox", { name: "Title" });
    const position = screen.getByRole("button", { name: /Position/ });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(first === "title" ? title : position).toBeDisabled();
    await waitFor(() => expect(first === "title" ? position : title).toHaveFocus());
    expect(save).not.toHaveBeenCalled();
  },
);
