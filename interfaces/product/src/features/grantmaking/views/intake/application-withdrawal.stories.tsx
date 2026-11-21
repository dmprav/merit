import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, mocked, waitFor, within } from "storybook/test";

import { editApplication } from "../../data/server/intake/intake.functions";
import {
  ApplicationManagementPreview,
  configureIntake,
} from "../../testing/application-intake.story-fixtures";

const meta = {
  title: "Features/Applications/Withdraw and reinstate",
  tags: ["!autodocs"],
  component: ApplicationManagementPreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  beforeEach: ({ args }) => configureIntake(args.state),
} satisfies Meta<typeof ApplicationManagementPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

const openWithdrawal = async ({
  canvas,
  canvasElement,
  userEvent,
}: Parameters<NonNullable<Story["play"]>>[0]) => {
  await userEvent.click(await canvas.findByRole("button", { name: "Application actions" }));
  await userEvent.click(
    within(canvasElement.ownerDocument.body).getByRole("menuitem", {
      name: "Withdraw application",
    }),
  );
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog");
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

export const ConfirmWithdraw: Story = {
  args: { state: "awaiting-reviews" },
  play: async (context) => {
    const dialog = await openWithdrawal(context);

    await waitFor(async () => expect(dialog.getByText(/outstanding review request/)).toBeVisible());
    await expect(dialog.getByRole("textbox", { name: /Withdrawal date/ })).toBeVisible();
  },
};
export const ConfirmWithdrawWithoutRequests: Story = {
  args: { state: "complete" },
  play: async (context) => {
    const dialog = await openWithdrawal(context);

    await expect(dialog.queryByText(/outstanding review request/)).not.toBeInTheDocument();
  },
};
export const WithdrawReasonRequired: Story = {
  args: { state: "ready" },
  play: async (context) => {
    const dialog = await openWithdrawal(context);
    await context.userEvent.click(dialog.getByRole("button", { name: "Withdraw application" }));

    await expect(dialog.getByText("Enter the reason for withdrawing.")).toBeVisible();
  },
};
export const WithdrawFailure: Story = {
  args: { state: "ready" },
  beforeEach: () => {
    mocked(editApplication).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async (context) => {
    const dialog = await openWithdrawal(context);
    await context.userEvent.type(dialog.getByRole("textbox", { name: /Reason/ }), "Stepped back.");
    await context.userEvent.click(dialog.getByRole("button", { name: "Withdraw application" }));

    await waitFor(async () => expect(await dialog.findByRole("alert")).toBeVisible());
  },
};
export const WithdrawConflict: Story = {
  args: { state: "ready" },
  beforeEach: () => {
    mocked(editApplication).mockResolvedValueOnce({ status: "conflict" });
  },
  play: async (context) => {
    const dialog = await openWithdrawal(context);
    await context.userEvent.type(dialog.getByRole("textbox", { name: /Reason/ }), "Stepped back.");
    await context.userEvent.click(dialog.getByRole("button", { name: "Withdraw application" }));

    await waitFor(async () =>
      expect(await dialog.findByText(/This application has changed/)).toBeVisible(),
    );
  },
};
export const Withdrawn: Story = {
  args: { state: "withdrawn" },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("button", { name: "Reinstate application" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Edit summary" })).not.toBeInTheDocument();
  },
};
export const ConfirmReinstate: Story = {
  args: { state: "withdrawn" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Reinstate application" }));

    await expect(within(canvasElement.ownerDocument.body).getByRole("dialog")).toHaveTextContent(
      /Review requests closed by the withdrawal stay closed/,
    );
  },
};

export const WithdrawAndReinstate: Story = {
  args: { state: "awaiting-reviews" },
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const withdrawal = await openWithdrawal(context);
    await expect(withdrawal.getByText(/outstanding review request/)).toBeVisible();
    await userEvent.type(
      withdrawal.getByRole("textbox", { name: /Reason/ }),
      "Applicant withdrew.",
    );
    await userEvent.click(withdrawal.getByRole("button", { name: "Withdraw application" }));

    await userEvent.click(await canvas.findByRole("button", { name: "Reinstate application" }));
    const reinstate = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: /Reinstate/ }),
    );
    await userEvent.type(reinstate.getByRole("textbox", { name: /Reason/ }), "Applicant returned.");
    await userEvent.click(reinstate.getByRole("button", { name: "Reinstate application" }));

    const nextWithdrawal = await openWithdrawal(context);
    await expect(nextWithdrawal.queryByText(/outstanding review request/)).not.toBeInTheDocument();
  },
};
