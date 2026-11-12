import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import type { ReviewerSummary } from "@merit/reviews/api";
import { Stack } from "@merit/ui/layout";
import { PageHeader } from "@merit/ui/page-header";

import { ManagerReviewers } from "./manager-reviewers";
import {
  ReviewPreviewFrame,
  managerReviews,
  managerTransport,
  reviewerPage,
} from "./reviewer.story-fixtures.tsx";

const ManagerPreview = ({
  assignment,
  scenario,
  onAssignmentsChange,
}: {
  assignment: ReviewerSummary | null;
  scenario: "ordinary" | "pending" | "failure";
  onAssignmentsChange: (assignments: ReviewerSummary[]) => void;
}) => {
  const [data] = useState(() =>
    managerTransport(
      {
        status: "ok",
        value: assignment
          ? [
              {
                ...assignment,
                history: [
                  { action: "invite", actor: "Dana Reed", note: "", at: "2027-01-15T10:00:00Z" },
                ],
              },
            ]
          : [],
      },
      scenario,
    ),
  );
  return (
    <ReviewPreviewFrame manager>
      <Stack gap={5}>
        <PageHeader
          title="Neighbour Table"
          kicker="Manage reviews"
          description="Invite an independent assessment of the application."
        />
        <h2>Review work</h2>
        <ManagerReviewers
          reviews={managerReviews()}
          data={data}
          onAssignmentsChange={onAssignmentsChange}
        />
      </Stack>
    </ReviewPreviewFrame>
  );
};

const meta = {
  title: "Features/Applications/Reviewer participation",
  component: ManagerPreview,
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    assignment: { ...reviewerPage().assignment, status: "invited" },
    scenario: "ordinary",
    onAssignmentsChange: fn(),
  },
  argTypes: { assignment: { control: false }, scenario: { control: false } },
} satisfies Meta<typeof ManagerPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AwaitingAcceptance: Story = {};

export const Invite: Story = {
  args: { assignment: null },
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Invite reviewer" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Invite reviewer" }),
      ).toBeVisible(),
    );
  },
};

export const Sending: Story = {
  args: { assignment: null, scenario: "pending" },
  play: async (context) => {
    await Invite.play!(context);
    const dialog = within(
      within(context.canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Invite reviewer",
      }),
    );
    await context.userEvent.click(dialog.getByRole("button", { name: "Invite reviewer" }));
    await expect(dialog.getByRole("button", { name: "Invite reviewer" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};

export const SendingFailure: Story = {
  args: { assignment: null, scenario: "failure" },
  play: async (context) => {
    await Invite.play!(context);
    const dialog = within(
      within(context.canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Invite reviewer",
      }),
    );
    await context.userEvent.click(dialog.getByRole("button", { name: "Invite reviewer" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "The request could not be confirmed",
    );
  },
};

export const ConflictResolution: Story = {
  args: {
    assignment: {
      ...reviewerPage().assignment,
      status: "conflict",
      conflict: "I advised the applicant on another project.",
    },
  },
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Clear conflict" }));
    const dialog = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Clear conflict" }),
    );
    await waitFor(() =>
      expect(dialog.getByText("I advised the applicant on another project.")).toBeVisible(),
    );
    await expect(
      dialog.getByText("Sam Morgan must accept the review again before continuing."),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Clear conflict" }));
    const resolution = dialog.getByRole("textbox", { name: "Explain why the review can proceed" });
    await expect(resolution).toHaveAccessibleDescription(
      "Explain why the review can proceed before clearing the conflict.",
    );
    await userEvent.type(
      resolution,
      "The advice concerned an unrelated project and ended two years ago.",
    );
    await expect(resolution).not.toHaveAttribute("aria-invalid", "true");
  },
};

export const EndAccess: Story = {
  args: { assignment: reviewerPage().assignment },
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "End access" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", {
          name: "End Sam Morgan’s access?",
        }),
      ).toBeVisible(),
    );
  },
};

export const UndeliveredInvitation: Story = {
  args: { assignment: { ...reviewerPage().assignment, status: "invited", delivery: "failed" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Email sending failed")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Resend invitation" })).toHaveAttribute(
      "data-variant",
      "primary",
    );
  },
};

export const NotificationFailure: Story = {
  args: {
    assignment: {
      ...reviewerPage().assignment,
      status: "submitted",
      hasSubmitted: true,
      notification: "failed",
    },
  },
};

export const ExpiredInvitation: Story = {
  args: {
    assignment: {
      ...reviewerPage().assignment,
      status: "invited",
      expiresAt: "2020-01-01T00:00:00Z",
      reviewer: "Sam Alexandra Morgan, Community Access and Participation",
      email: "sam.alexandra.morgan.community.participation@example.test",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Invitation expired")).toBeVisible();
    // The due date reads as a labelled, localized date rather than an ISO value.
    await expect(canvas.getByText(/Response requested by .*2027/)).toBeVisible();
    await expect(canvas.queryByText(/2027-02-10/)).toBeNull();
  },
};
