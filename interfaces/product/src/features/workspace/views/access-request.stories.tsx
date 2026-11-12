import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import { MessagesProvider } from "@merit/i18n";

import { WebMessagesProvider, webMessages } from "../../../app/messages";
import type { RequestAccess } from "../contracts";
import { AccessRequestDialog } from "./access-request";

const meta = {
  title: "Features/Workspace/Request access",
  tags: ["!autodocs"],
  component: AccessRequestDialog,
  parameters: { controls: { disable: true } },
  args: { hydrated: true, request: fn<RequestAccess>(async () => ({ status: "ok" as const })) },
  decorators: [
    (Story) => (
      <WebMessagesProvider>
        <Story />
      </WebMessagesProvider>
    ),
  ],
} satisfies Meta<typeof AccessRequestDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

type Context = Parameters<NonNullable<Story["play"]>>[0];

const open = async ({ canvas, canvasElement, userEvent }: Context) => {
  await userEvent.click(canvas.getByRole("button", { name: "Request an invitation" }));
  return within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
};

const submit = async (context: Context) => {
  const dialog = await open(context);
  await context.userEvent.type(
    dialog.getByRole("textbox", { name: "Email address" }),
    "visitor@example.test",
  );
  await context.userEvent.click(dialog.getByRole("button", { name: "Submit request" }));
  return dialog;
};

export const Open: Story = {
  play: async (context) => {
    await open(context);
  },
};
export const ExpandedCopy: Story = {
  args: { request: fn<RequestAccess>(async () => ({ status: "unavailable" as const })) },
  decorators: [
    (Story) => (
      <MessagesProvider
        messages={{
          ...webMessages,
          onboarding: {
            ...webMessages.onboarding,
            request: {
              ...webMessages.onboarding.request,
              title: "⟦Request an invitation to explore a Merit workspace⟧",
              email: "⟦Email address where you would like to receive your invitation⟧",
              submit: "⟦Submit this request for a workspace invitation⟧",
              close: "⟦Close this invitation request⟧",
              error:
                "⟦Your invitation request could not be saved just now. Your email address is still here so you can try sending the request again⟧",
            },
          },
        }}
      >
        <Story />
      </MessagesProvider>
    ),
  ],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "⟦Request an invitation to explore a Merit workspace⟧" }),
    );
  },
};
export const Validation: Story = {
  play: async (context) => {
    const dialog = await open(context);
    await context.userEvent.click(dialog.getByRole("button", { name: "Submit request" }));
    await expect(dialog.getByRole("textbox", { name: "Email address" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(context.args.request).not.toHaveBeenCalled();
  },
};
export const Submitting: Story = {
  args: { request: fn<RequestAccess>(() => new Promise(() => {})) },
  play: async (context) => {
    const dialog = await submit(context);
    await expect(dialog.getByRole("button", { name: "Submitting request…" })).toBeDisabled();
    await context.userEvent.keyboard("{Escape}");
    await expect(dialog.getByRole("form")).toBeVisible();
  },
};
export const Submitted: Story = {
  play: async (context) => {
    const dialog = await submit(context);
    await expect(await dialog.findByRole("status")).toHaveTextContent("Request saved.");
    await expect(context.args.request).toHaveBeenCalledWith({ email: "visitor@example.test" });
  },
};
export const RateLimited: Story = {
  args: { request: fn<RequestAccess>(async () => ({ status: "limited" as const })) },
  play: async (context) => {
    const dialog = await submit(context);
    await expect(await dialog.findByRole("alert")).toHaveTextContent("try again in an hour");
    await expect(dialog.getByRole("textbox", { name: "Email address" })).toHaveValue(
      "visitor@example.test",
    );
  },
};
export const Unavailable: Story = {
  args: { request: fn<RequestAccess>(async () => ({ status: "unavailable" as const })) },
  play: async (context) => {
    const dialog = await submit(context);
    await expect(await dialog.findByRole("alert")).toHaveTextContent("could not be saved");
    await expect(dialog.getByRole("textbox", { name: "Email address" })).toHaveValue(
      "visitor@example.test",
    );
  },
};
