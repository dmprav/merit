import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { StoryEnvironment } from "../../../../tests/storybook";
import { DemoEntryView } from "./demo-entry";

const meta = {
  title: "Features/Demo/Entry",
  tags: ["!autodocs"],
  component: DemoEntryView,
  decorators: [
    (Story) => (
      <StoryEnvironment path="/demo">
        <Story />
      </StoryEnvironment>
    ),
  ],
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: {
    state: { status: "empty" },
    pending: false,
    hydrated: true,
    start: fn<(fresh: boolean, guided?: boolean) => Promise<void>>(async () => {}),
  },
} satisfies Meta<typeof DemoEntryView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await expect(
      canvas.getByRole("heading", { name: "Step into a program manager’s workspace" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "This is your own demo workspace. You can make changes and reset it; it remains available for seven days.",
      ),
    ).toBeVisible();
    await expect(args.start).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Explore the example" }));
    await expect(args.start).toHaveBeenCalledOnce();
    await expect(args.start).toHaveBeenCalledWith(false, true);
  },
};
export const BrowseWorkspace: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Browse the workspace" }));
    await expect(args.start).toHaveBeenCalledOnce();
    await expect(args.start).toHaveBeenCalledWith(false, false);
  },
};
export const Expired: Story = {
  args: { state: { status: "expired" } },
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.getByRole("heading", { name: "Your demo has expired" })).toBeVisible();
    await expect(canvas.getByText("Start fresh with a new fictional workspace.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Start fresh" }));
    await expect(args.start).toHaveBeenCalledOnce();
    await expect(args.start).toHaveBeenCalledWith(true);
  },
};
export const Unavailable: Story = {
  args: { state: { status: "unavailable" } },
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.getByRole("heading", { name: "Demo could not be opened" })).toBeVisible();
    await expect(
      canvas.getByText("Please try again. Your existing work stays unchanged."),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(args.start).toHaveBeenCalledOnce();
    await expect(args.start).toHaveBeenCalledWith(false);
  },
};
export const RateLimited: Story = {
  ...Unavailable,
  args: { state: { status: "limited" } },
};
export const Pending: Story = {
  args: { state: { status: "expired" }, pending: true },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { name: "Opening your demo…" })).toBeVisible();
    await expect(
      canvas.queryByText("Start fresh with a new fictional workspace."),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
    await expect(args.start).not.toHaveBeenCalled();
  },
};
export const ExistingDemo: Story = {
  ...Pending,
  args: {
    state: { status: "ready", workspaceSlug: "existing-demo", expiresAt: "2027-01-25T12:00:00Z" },
    pending: true,
  },
};
export const BeforeHydration: Story = {
  args: { hydrated: false },
  play: async ({ canvas, userEvent, args }) => {
    for (const name of ["Explore the example", "Browse the workspace"]) {
      const start = canvas.getByRole("button", { name });
      await expect(start).toBeDisabled();
      await userEvent.click(start);
    }
    await expect(args.start).not.toHaveBeenCalled();
  },
};
