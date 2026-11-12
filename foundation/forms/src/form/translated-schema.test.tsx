import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { defaultLocale, MessagesProvider } from "@merit/i18n";

import { FormTextField } from "../fields/text-field";
import { Form } from "./form";
import { useTranslatedSchema } from "./translated-schema";
import { useForm } from "./use-form";

const messages = {
  common: {
    validation: {
      required: "Translated required",
      email: "Translated email",
      minLength: "Translated minimum {{count}}",
      maxLength: "Translated maximum {{count}}",
      maxItems: "Translated item limit {{count}}",
      invalid: "Translated invalid",
    },
  },
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MessagesProvider messages={messages}>{children}</MessagesProvider>
);

it.each([
  [z.string().trim().min(1), "  ", "Translated required"],
  [z.email(), "invalid", "Translated email"],
  [z.string().min(3), "ab", "Translated minimum 3"],
  [z.string().max(3), "abcd", "Translated maximum 3"],
  [z.array(z.string()).max(2), ["a", "b", "c"], "Translated item limit 2"],
  [z.enum(["member", "administrator"]), "unknown", "Translated invalid"],
] as const)("uses the common catalog for invalid input %#", async (schema, value, message) => {
  const { result } = renderHook(() => useTranslatedSchema<unknown, unknown>(schema), {
    wrapper: Wrapper,
  });

  expect(await result.current["~standard"].validate(value)).toMatchObject({
    issues: [{ message }],
  });
});

it.each([
  [z.string().max(1), "ab", "Enter no more than 1 character."],
  [z.string().max(2), "abc", "Enter no more than 2 characters."],
  [z.array(z.string()).max(1), ["a", "b"], "Use no more than 1 item."],
  [z.array(z.string()).max(2), ["a", "b", "c"], "Use no more than 2 items."],
  [z.string().min(2), "a", "Enter at least 2 characters."],
] as const)(
  "uses the common singular or plural form for schema limits %#",
  async (schema, value, message) => {
    const { result } = renderHook(() => useTranslatedSchema<unknown, unknown>(schema), {
      wrapper: ({ children }) => <MessagesProvider messages={{}}>{children}</MessagesProvider>,
    });

    expect(await result.current["~standard"].validate(value)).toMatchObject({
      issues: [{ message }],
    });
  },
);

it("keeps invalid input usable with expanded catalog copy and submits after correction", async () => {
  const save = vi.fn(() => null);
  const schema = z.object({ email: z.email() });
  const action = "⟦Continue signing in to your Merit workspace with this email address⟧";
  const invalidEmail = "⟦Enter a complete email address including its domain, then try again⟧";

  const Example = () => {
    const { t } = useTranslation("common");
    const { form, submission } = useForm({
      defaultValues: { email: "" },
      schema: useTranslatedSchema(schema),
      onSubmit: save,
      submitErrorMessage: t("validation.invalid"),
    });
    return (
      <Form
        label={t("signIn")}
        submission={submission}
        actions={<button type="submit">{t("signIn")}</button>}
      >
        <form.Field name="email">
          {(field) => <FormTextField field={field} label="Email" />}
        </form.Field>
      </Form>
    );
  };

  const expandedMessages = {
    common: {
      signIn: action,
      validation: { email: invalidEmail, invalid: "⟦Check your input and try again⟧" },
    },
  };
  const { rerender } = render(
    <MessagesProvider messages={expandedMessages}>
      <Example />
    </MessagesProvider>,
  );
  const input = screen.getByRole("textbox", { name: "Email" });

  fireEvent.change(input, { target: { value: "unfinished@" } });
  fireEvent.click(screen.getByRole("button", { name: action }));

  await waitFor(() => expect(input).toHaveAccessibleDescription(invalidEmail));
  expect(input).toHaveValue("unfinished@");
  expect(save).not.toHaveBeenCalled();

  rerender(
    <MessagesProvider
      messages={expandedMessages}
      locale={{ ...defaultLocale, formatLocale: "en-US" }}
    >
      <Example />
    </MessagesProvider>,
  );
  expect(screen.getByRole("textbox", { name: "Email" })).toBe(input);
  expect(input).toHaveValue("unfinished@");

  fireEvent.change(input, { target: { value: "dana@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: action }));

  await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({ email: "dana@example.test" }));
  expect(screen.queryByText(invalidEmail)).not.toBeInTheDocument();
});

it("preserves nested field paths and form-level issues while translating domain codes", async () => {
  const schema = z
    .object({
      people: z.array(z.object({ email: z.email() })),
    })
    .refine(() => false, { params: { reason: "responsibility_required" } });
  const { result } = renderHook(
    () =>
      useTranslatedSchema(schema, (issue) =>
        issue.code === "custom" && issue.params?.reason === "responsibility_required"
          ? "Translated responsibility"
          : undefined,
      ),
    { wrapper: Wrapper },
  );

  expect(
    await result.current["~standard"].validate({ people: [{ email: "invalid" }] }),
  ).toMatchObject({
    issues: [
      { path: ["people", 0, "email"], message: "Translated email" },
      { path: [], message: "Translated responsibility" },
    ],
  });
});

it("preserves normalized output and explicit feature messages without mutating the shared schema", async () => {
  const schema = z.object({ name: z.string().trim().min(1) });
  const { result } = renderHook(() => useTranslatedSchema(schema), { wrapper: Wrapper });

  expect(await result.current["~standard"].validate({ name: "  Dana  " })).toEqual({
    value: { name: "Dana" },
  });
  expect(schema.safeParse({ name: "" }).error?.issues[0]?.message).not.toBe("Translated required");

  const explicit = z.string().min(1, "Feature catalog message");
  const { result: feature } = renderHook(() => useTranslatedSchema(explicit), { wrapper: Wrapper });
  expect(await feature.current["~standard"].validate("")).toMatchObject({
    issues: [{ message: "Feature catalog message" }],
  });
});
