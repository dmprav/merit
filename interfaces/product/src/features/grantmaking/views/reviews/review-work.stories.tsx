import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { expect, mocked, waitFor, within } from "storybook/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { ApplicationView } from "@merit/grantmaking-web/applications";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { ApplicationContainedPreview } from "@merit/grantmaking-web/testing";
import { roundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { type ReviewState } from "@merit/reviews/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { StoryEnvironment } from "../../../../../tests/storybook";
import { configureContacts } from "../../../contacts/contacts.story-fixtures";
import { readContacts } from "../../../contacts/data/server/contacts.functions";
import { workspaceReviewData } from "../../data/reviews/workspace-data";
import { saveReview } from "../../data/server/reviews/reviews.functions";

const round = getExampleRound();
const sam = "60000000-0000-4000-8000-000000000001";
const jules = "60000000-0000-4000-8000-000000000002";
const recorder = { userId: "dana", name: "Dana Reed", recordedAt: "2027-01-16T10:00:00Z" };
const reviews: ReviewState = {
  revision: reviewRevisionSchema.parse(2),
  assessments: [
    {
      id: "sam-assessment",
      contactId: sam,
      reviewer: "Sam Morgan",
      requestId: null,
      previousId: null,
      versions: [
        {
          content: {
            applicationVersion: materialVersionSchema.parse(1),
            criteriaVersion: criteriaVersionSchema.parse(1),
            date: "2027-01-16",
            position: "Fund",
            amount: "18000",
            reasoning:
              "The activities fit the round and there is initial interest. The free venue makes the budget credible.",
            observations: [],
          },
          criteria: round.criteria,
          recorder,
          note: "",
        },
      ],
    },
  ],
  requests: [
    {
      id: "jules-request",
      contactId: jules,
      reviewer: "Jules Patel",
      applicationVersion: materialVersionSchema.parse(1),
      criteriaVersion: criteriaVersionSchema.parse(1),
      criteria: round.criteria,
      status: "outstanding",
      recorder,
      closedBy: null,
    },
  ],
};

const ReviewsPreview = ({
  refreshFailure = false,
  concurrentChange = false,
}: {
  refreshFailure?: boolean;
  concurrentChange?: boolean;
}) => {
  const client = useQueryClient();
  const [state, setState] = useState(reviews);
  const transport = workspaceReviewData(client, "alder", "workshop-saturdays", false);
  const application = roundView({
    ...round,
    applications: [{ ...round.applications[2]!, reviews: state }],
  }).applications[0]!;

  return (
    <ApplicationContainedPreview locationKey={application.title}>
      <ApplicationView
        application={application}
        round={round}
        tab="reviews"
        reviewData={{
          ...transport,
          save: async (change, baseline) => {
            const result = await transport.save(change, baseline);
            if (result.status !== "ok") {
              return result;
            }
            const contacts = await readContacts({ data: { workspaceSlug: "alder" } });
            // Reflect successful mock writes so the preview remains usable after saving.
            setState((current) => {
              const next = structuredClone(current);
              next.revision = result.revision;
              const contact =
                "contactId" in change && contacts.status === "ok"
                  ? contacts.contacts.find((item) => item.id === change.contactId)
                  : undefined;
              if (change.action === "request") {
                const replaced = next.requests.find((item) => item.id === change.replacesId);
                if (replaced) {
                  replaced.status = "cancelled";
                  replaced.closedBy = recorder;
                }
                next.requests.push({
                  id: change.id,
                  contactId: change.contactId,
                  reviewer: contact?.name ?? "Reviewer",
                  applicationVersion: application.version,
                  criteriaVersion: round.criteriaVersion,
                  criteria: round.criteria,
                  status: "outstanding",
                  recorder,
                  closedBy: null,
                });
              } else if (change.action === "cancel") {
                const request = next.requests.find((item) => item.id === change.id);
                if (request) {
                  request.status = "cancelled";
                  request.closedBy = recorder;
                }
              } else {
                const version = {
                  content: change.content,
                  criteria:
                    round.criteriaHistory.find(
                      (item) => item.version === change.content.criteriaVersion,
                    )?.criteria ?? null,
                  recorder,
                  note: change.action === "edit" ? change.note : "",
                };
                if (change.action === "edit") {
                  next.assessments.find((item) => item.id === change.id)?.versions.push(version);
                } else {
                  next.assessments.push({
                    id: change.id,
                    contactId: change.contactId,
                    reviewer: contact?.name ?? "Reviewer",
                    requestId: change.requestId,
                    previousId: change.previousId,
                    versions: [version],
                  });
                  const request = next.requests.find((item) => item.id === change.requestId);
                  if (request) {
                    request.status = "received";
                    request.closedBy = recorder;
                  }
                }
              }
              return next;
            });
            return result;
          },
          refresh: async () => {
            if (refreshFailure) {
              throw new Error("Preview refresh failure");
            }
            if (concurrentChange) {
              setState((current) =>
                current.revision === reviews.revision
                  ? { ...current, revision: reviewRevisionSchema.parse(current.revision + 1) }
                  : current,
              );
            }
            await transport.refresh();
          },
        }}
        intakeState={{ revision: 0, workingRevision: null, history: [] }}
      />
    </ApplicationContainedPreview>
  );
};

const meta = {
  title: "Features/Applications/Manage reviews",
  tags: ["!autodocs"],
  component: ReviewsPreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  decorators: [
    (Story) => (
      <StoryEnvironment>
        <GrantmakingDrafts>
          <Story />
        </GrantmakingDrafts>
      </StoryEnvironment>
    ),
  ],
  beforeEach: () => {
    mocked(saveReview).mockImplementation(async ({ data }) => ({
      status: "ok",
      revision: reviewRevisionSchema.parse(data.expectedRevision + 1),
    }));
    configureContacts([
      {
        id: sam,
        name: "Sam Morgan",
        email: "sam@example.test",
        affiliation: "",
        archived: false,
        revision: 0,
        applicationTitles: [],
        history: [],
      },
      {
        id: jules,
        name: "Jules Patel",
        email: "jules@example.test",
        affiliation: "",
        archived: false,
        revision: 0,
        applicationTitles: [],
        history: [],
      },
    ]);
  },
} satisfies Meta<typeof ReviewsPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ChangedApplication: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("article", { name: "Assessment by Sam Morgan" })).toBeVisible();
    await expect(canvas.getByText("Application changed since this assessment")).toBeVisible();
    await expect(canvas.getByRole("heading", { name: /Awaiting assessments/ })).toBeVisible();
  },
};
export const RecordingAssessment: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: "Record assessment" })[0]!);
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "Record assessment",
    });

    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: "Assessment text" })).toBeVisible(),
    );
    await expect(within(dialog).getByRole("button", { name: "Save assessment" })).toBeVisible();
  },
};

export const DraftRecovery: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getAllByRole("button", { name: "Record assessment" })[0]!);
    await userEvent.type(
      within(page.getByRole("dialog")).getByRole("textbox", { name: "Assessment text" }),
      "The venue costs need clarification.",
    );
    await userEvent.click(
      within(page.getByRole("form", { name: "Record assessment" })).getByRole("button", {
        name: "Close",
      }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Resume editing" }));

    await expect(
      within(page.getByRole("dialog")).getByRole("textbox", { name: "Assessment text" }),
    ).toHaveValue("The venue costs need clarification.");
  },
};

export const AddingRequest: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add review request" }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "Add review request",
    });

    await waitFor(() =>
      expect(
        within(dialog).getByText("Choose a reviewer to record a request. No message is sent."),
      ).toBeVisible(),
    );
    await expect(within(dialog).getByRole("textbox", { name: "Find a contact" })).toBeVisible();
    await expect(within(dialog).getByRole("option", { name: /Jules Patel/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};

export const RequestHistory: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Request history/ }));
    const details = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Request history" }),
    );

    await waitFor(() => expect(details.getByText("Added by Dana Reed")).toBeVisible());
    await expect(details.getByText("16 Jan 2027, 10:00 UTC")).toBeVisible();
  },
};

export const AssessmentDetails: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: "Review details" })[0]!);
    const details = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Review details" }),
    );

    await waitFor(() => expect(details.getByText("Dana Reed")).toBeVisible());
    await expect(details.getByText("Criteria reviewed")).toBeVisible();
  },
};

export const CreateReviewer: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: "Record assessment" })[0]!);
    const page = within(canvasElement.ownerDocument.body);
    const form = within(page.getByRole("form", { name: "Record assessment" }));

    await expect(form.queryByRole("button", { name: "Add contact" })).not.toBeInTheDocument();

    await userEvent.click(form.getByRole("button", { name: /Reviewer/ }));
    await userEvent.click(page.getByRole("button", { name: "Add contact" }));
    const contactDialog = page.getByRole("dialog", { name: "Add contact" });
    const contact = within(contactDialog);

    await waitFor(() => expect(contact.getByRole("textbox", { name: "Name" })).toBeVisible());

    await userEvent.click(within(contact.getByRole("form")).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(contactDialog).not.toBeInTheDocument());
    await expect(page.getByRole("form", { name: "Record assessment" })).toBeVisible();
  },
};

export const CriterionNotes: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const pending = within(canvas.getByRole("article", { name: "Jules Patel" }));
    await userEvent.click(pending.getByRole("button", { name: "Record assessment" }));
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Add criterion notes" }));
    await userEvent.type(
      dialog.getByRole("textbox", { name: round.criteria![0]!.title }),
      "The proposal connects people through regular shared activities.",
    );

    await expect(dialog.getByRole("region", { name: "Notes by criterion" })).toBeVisible();

    const note = dialog.getByRole("textbox", { name: round.criteria![0]!.title });

    await expect(note).toHaveFocus();
    await expect(note.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      dialog.getByRole("button", { name: "Save assessment" }).getBoundingClientRect().top,
    );
  },
};

export const ReplacingReviewer: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Request actions for Jules Patel" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole("menuitem", { name: "Replace reviewer" }));
    const picker = within(page.getByRole("dialog", { name: "Replace reviewer" }));

    await waitFor(() =>
      expect(picker.getByRole("textbox", { name: "Find a contact" })).toBeVisible(),
    );
    await expect(picker.getByRole("option", { name: /Jules Patel/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};

type Context = Parameters<NonNullable<Story["play"]>>[0];

const correctAssessment = async ({ canvas, canvasElement, userEvent }: Context) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole("button", { name: "Assessment actions for Sam Morgan" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Edit recorded assessment" }));
  const dialog = within(await page.findByRole("dialog", { name: "Edit recorded assessment" }));
  // Paste the replacement: per-key typing is covered by DraftRecovery and AssessmentSaved,
  // and typing every character here makes the conflict and refresh stories slow to settle.
  await userEvent.clear(dialog.getByRole("textbox", { name: "Assessment text" }));
  await userEvent.paste("The revised venue costs are supported by a written quote.");
  return dialog;
};

const saveCorrection = async (context: Context) => {
  const dialog = await correctAssessment(context);
  await context.userEvent.click(dialog.getByRole("button", { name: "Save assessment" }));
  return dialog;
};

export const CorrectingAssessment: Story = {
  play: async (context) => {
    await correctAssessment(context);
  },
};
export const AssessmentSaved: Story = {
  play: async (context) => {
    const pending = within(context.canvas.getByRole("article", { name: "Jules Patel" }));
    await context.userEvent.click(pending.getByRole("button", { name: "Record assessment" }));
    const page = within(context.canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog", { name: "Record assessment" }));
    await context.userEvent.type(
      dialog.getByRole("textbox", { name: "Assessment text" }),
      "The revised budget makes the venue costs clear.",
    );
    await context.userEvent.click(dialog.getByRole("button", { name: "Save assessment" }));
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(
      context.canvas.getByRole("article", { name: "Assessment by Jules Patel" }),
    ).toHaveTextContent("The revised budget makes the venue costs clear.");
  },
};
export const CorrectionSaved: Story = {
  play: async (context) => {
    await saveCorrection(context);
    await waitFor(() =>
      expect(
        within(context.canvasElement.ownerDocument.body).queryByRole("dialog"),
      ).not.toBeInTheDocument(),
    );
    await expect(
      context.canvas.getByRole("article", { name: "Assessment by Sam Morgan" }),
    ).toHaveTextContent("The revised venue costs are supported by a written quote.");
  },
};
export const Saving: Story = {
  beforeEach: () => {
    mocked(saveReview).mockImplementation(() => new Promise(() => {}));
  },
  play: async (context) => {
    const dialog = await saveCorrection(context);
    await expect(dialog.getByRole("button", { name: "Save assessment" })).toBeDisabled();
  },
};
export const SaveFailure: Story = {
  beforeEach: () => {
    mocked(saveReview).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async (context) => {
    const dialog = await saveCorrection(context);
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Your changes are preserved");
    await expect(dialog.getByRole("textbox", { name: "Assessment text" })).toHaveValue(
      "The revised venue costs are supported by a written quote.",
    );
  },
};
export const ConcurrentChanges: Story = {
  args: { concurrentChange: true },
  beforeEach: () => {
    mocked(saveReview).mockResolvedValueOnce({ status: "conflict" });
  },
  play: async (context) => {
    const dialog = await saveCorrection(context);
    await expect(
      await dialog.findByRole("button", { name: "Keep draft after reviewing current work" }),
    ).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Assessment text" })).toHaveValue(
      "The revised venue costs are supported by a written quote.",
    );
    await expect(dialog.getByRole("button", { name: "Save assessment" })).toBeDisabled();
  },
};
export const SavedButRefreshFailed: Story = {
  args: { refreshFailure: true },
  play: async (context) => {
    await saveCorrection(context);
    await waitFor(() =>
      expect(
        within(context.canvasElement.ownerDocument.body).queryByRole("dialog"),
      ).not.toBeInTheDocument(),
    );
    await expect(context.canvas.getByRole("alert")).toHaveTextContent(
      "Saved, but the latest information could not be loaded",
    );
    await expect(context.canvas.getByRole("button", { name: "Retry" })).toBeEnabled();
  },
};
