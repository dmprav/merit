import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, mocked, waitFor, within } from "storybook/test";

import { selectContact } from "../../data/server/applications/application-contact.functions";
import { editApplication } from "../../data/server/intake/intake.functions";
import {
  ApplicationManagementPreview,
  configureIntake,
  contacts,
  original,
  publicId,
} from "../../testing/application-intake.story-fixtures";

const meta = {
  title: "Features/Applications/Manage intake",
  tags: ["!autodocs"],
  component: ApplicationManagementPreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  beforeEach: ({ args }) => configureIntake(args.state),
} satisfies Meta<typeof ApplicationManagementPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ReadinessChecks: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("button", { name: "Mark ready for review" }),
    ).toBeDisabled();
  },
};
export const ReadyToMark: Story = {
  args: { state: "complete" },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("button", { name: "Mark ready for review" }),
    ).toBeEnabled();
  },
};
export const ReadyForReview: Story = {
  args: { state: "ready" },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.queryByRole("button", { name: "Start revised submission" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Application actions" }));
    await waitFor(() =>
      expect(
        within(document.body).getByRole("menuitem", { name: "Start revised submission" }),
      ).toBeVisible(),
    );
    await userEvent.keyboard("{Escape}");
  },
};
export const WorkingRevision: Story = {
  args: { state: "revision" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByText(/remains current until this revision is recorded/)).toBeVisible();

    await userEvent.click(
      await canvas.findByRole("button", { name: "Review saved working revision" }),
    );
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "Review saved working revision",
    });

    await expect(dialog).toHaveTextContent("Include accessible transport to the venue.");
    await expect(dialog).toHaveTextContent("€28,000");
  },
};
export const IntakeCorrection: Story = { args: { state: "correction" } };
export const RecordingFailure: Story = {
  args: { state: "revision" },
  beforeEach: () => {
    mocked(editApplication).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Record revision" }));

    await waitFor(async () => expect(await canvas.findByRole("alert")).toBeVisible());
  },
};
export const ConfirmDiscardRevision: Story = {
  args: { state: "revision" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Application actions" }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", {
        name: "Discard working revision",
      }),
    );

    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    ).toHaveAccessibleDescription(/current application and earlier versions/);
  },
};
export const ConfirmDelete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Application actions" }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", {
        name: "Delete application",
      }),
    );

    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    ).toHaveTextContent(original.title);
  },
};

/** A funded application cannot be withdrawn until a new decision version supersedes the commitment. */
export const WithdrawFundedApplication: Story = {
  args: { state: "funded" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Application actions" }));
    await userEvent.click(body.getByRole("menuitem", { name: "Withdraw application" }));
    const dialog = within(body.getByRole("dialog"));

    // The dialog fades in, so wait for its explanation to be shown.
    await waitFor(() => expect(dialog.getByText(/has committed funding/)).toBeVisible());
    await expect(dialog.queryByRole("textbox")).not.toBeInTheDocument();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  },
};

export const StaffSummaryDuringPreparation: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("button", { name: "Mark ready for review" })).toBeDisabled();
    await expect(
      canvas.queryByRole("region", { name: "Manager recommendation" }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByRole("region", { name: "Review" })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Add staff summary" }));
    const panel = within(canvas.getByRole("complementary", { name: "Application workspace" }));
    const form = within(panel.getByRole("form", { name: "Edit staff summary" }));
    await userEvent.type(
      form.getByRole("textbox", { name: "Staff summary" }),
      "Awaiting the applicant’s budget breakdown.",
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await expect(
      await panel.findByText("Awaiting the applicant’s budget breakdown."),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Mark ready for review" })).toBeDisabled();
  },
};

export const EditContactAndProjectDates: Story = {
  args: { state: "complete" },
  beforeEach: () => {
    mocked(editApplication).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const panel = within(canvas.getByRole("complementary", { name: "Application workspace" }));
    await userEvent.click(canvas.getByRole("button", { name: "Edit application details" }));
    const form = within(canvas.getByRole("form", { name: "Edit application details" }));
    await userEvent.click(await form.findByRole("button", { name: /Applicant contact/ }));
    await userEvent.click(await body.findByRole("option", { name: /Sam Morgan/ }));
    await userEvent.clear(form.getByRole("textbox", { name: "Project dates" }));
    await userEvent.type(
      form.getByRole("textbox", { name: "Project dates" }),
      "April–September 2027",
    );

    await expect(mocked(editApplication)).not.toHaveBeenCalled();

    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await expect(await form.findByRole("alert")).toHaveTextContent("changes are preserved");
    await expect(form.getByRole("textbox", { name: "Project dates" })).toHaveValue(
      "April–September 2027",
    );

    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        canvas.queryByRole("form", { name: "Edit application details" }),
      ).not.toBeInTheDocument(),
    );
    await expect(panel.getByText("April–September 2027")).toBeVisible();
    await expect(panel.getByText("Sam Morgan")).toBeVisible();
  },
};

export const ReconcileApplicationDetails: Story = {
  args: { state: "complete" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit application details" }));
    const details = within(canvas.getByRole("form", { name: "Edit application details" }));
    const amount = details.getByRole("textbox", { name: "Requested amount" });
    await userEvent.clear(amount);
    await userEvent.type(amount, "28500.50");
    await userEvent.click(details.getByRole("button", { name: "Close" }));
    await userEvent.click(canvas.getByRole("button", { name: "Edit applicant submission" }));
    const submission = within(canvas.getByRole("form", { name: "Edit applicant submission" }));
    await userEvent.type(
      submission.getAllByRole("textbox", { name: "Applicant’s response" })[0]!,
      " We also provide transport.",
    );
    await userEvent.click(submission.getByRole("button", { name: "Save" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue editing application details" }),
    );
    const conflictForm = within(canvas.getByRole("form", { name: "Edit application details" }));
    await expect(conflictForm.getByRole("textbox", { name: "Requested amount" })).toHaveValue(
      "28500.50",
    );
    await expect(conflictForm.getByRole("alert")).toHaveTextContent(
      "This application changed while you were editing",
    );
    // The changed field shows its saved value in place.
    await expect(conflictForm.getByText("€24,000")).toBeVisible();
    await expect(conflictForm.queryByRole("button", { name: "View latest" })).toBeNull();
  },
};

export const EditRecordedContact: Story = {
  args: { state: "ready" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.queryByRole("button", { name: /Change contact/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Edit application details" }));
    const editor = within(canvas.getByRole("group", { name: "Edit application details" }));
    await expect(editor.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(editor.getByRole("button", { name: /Change contact/ }));
    await userEvent.click(await body.findByRole("option", { name: /Sam Morgan/ }));
    await waitFor(() =>
      expect(editor.getByRole("button", { name: "Change contact: Sam Morgan" })).toBeEnabled(),
    );
    await expect(mocked(editApplication)).not.toHaveBeenCalled();
    await expect(mocked(selectContact)).toHaveBeenCalledTimes(1);
    await userEvent.click(editor.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Edit application details" })).toHaveFocus(),
    );
    await expect(canvas.queryByRole("button", { name: /Change contact/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(canvas.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument(),
    );
    await expect(mocked(selectContact)).toHaveBeenLastCalledWith({
      data: { workspaceSlug: "alder", publicId, contactId: contacts[0]!.id, expectedRevision: 3 },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Edit application details" }));
  },
};
