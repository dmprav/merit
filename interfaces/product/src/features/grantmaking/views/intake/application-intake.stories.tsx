import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { expect, waitFor, mocked, within } from "storybook/test";

import type { IntakeState } from "@merit/applications-web/contracts";
import type { IntakeSession } from "@merit/applications-web/intake";
import { materialVersionSchema } from "@merit/applications/domain";
import { intakeContent, prepareIntakeChange } from "@merit/applications/domain";
import { ApplicationView } from "@merit/grantmaking-web/applications";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { ApplicationContainedPreview } from "@merit/grantmaking-web/testing";
import { decodeApplicationDetail, encodeApplicationDetail } from "@merit/grantmaking/api";
import { roundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { fromMinorUnits } from "@merit/money";
import { reviewRevisionSchema } from "@merit/reviews/domain";

import { StoryEnvironment } from "../../../../../tests/storybook";
import { readContacts } from "../../../contacts/data/server/contacts.functions";
import { workspaceIntakeData } from "../../data/intake/workspace-data";
import { applicationOptions } from "../../data/queries";
import { readFundingApplicationPage } from "../../data/server/funding-round.functions";
import { readApplicationHistory } from "../../data/server/history.functions";
import { editApplication } from "../../data/server/intake/intake.functions";

const round = { ...getExampleRound(), id: "k7m2p9x4n6rt" };
const original = round.applications[0]!;
const contacts = [
  {
    id: "60000000-0000-4000-8000-000000000001",
    name: "Leah Martin",
    email: "leah@example.test",
    affiliation: "Neighbourhood Kitchen",
    archived: false,
    revision: 0,
    history: [],
    applicationTitles: [],
  },
  {
    id: "60000000-0000-4000-8000-000000000002",
    name: "Sam Morgan",
    email: "sam@example.test",
    affiliation: "",
    archived: false,
    revision: 0,
    history: [],
    applicationTitles: [],
  },
];
const recordedAt = "2026-11-09T10:00:00Z";
const publicId = "m7n2p9x4k6rt";

type Page = Extract<Awaited<ReturnType<typeof readFundingApplicationPage>>, { status: "ok" }>;

const fixture = (
  state:
    | "incomplete"
    | "complete"
    | "ready"
    | "awaiting-reviews"
    | "revision"
    | "correction"
    | "history"
    | "withdrawn",
): Page => {
  const preparing = state === "incomplete" || state === "complete";
  const application = {
    ...original,
    id: publicId,
    contactId: state === "incomplete" ? null : contacts[0]!.id,
    ...(state === "history"
      ? { version: materialVersionSchema.parse(2), requested: fromMinorUnits(2800000n) }
      : {}),
    intakeStatus: preparing ? ("in_preparation" as const) : ("ready" as const),
    ...(state === "awaiting-reviews"
      ? {
          reviews: {
            ...original.reviews,
            requests: [
              ...original.reviews.requests,
              ...["Jules Patel", "Maya Thompson"].map((reviewer, index) => ({
                id: `awaiting-${index}`,
                contactId: `60000000-0000-4000-8000-00000000010${index}`,
                reviewer,
                applicationVersion: original.version,
                criteriaVersion: round.criteriaVersion,
                criteria: null,
                status: "outstanding" as const,
                recorder: { userId: "dana", name: "Dana Reed", recordedAt },
                closedBy: null,
              })),
            ],
          },
        }
      : {}),
    ...(state === "withdrawn"
      ? {
          withdrawal: {
            withdrawnOn: "2026-11-03",
            reason:
              "The applicant secured funding from a regional foundation and asked us to stop work on this application. They may apply again next year, so please keep the material and our review notes in case they return with an updated plan.",
            recorder: { userId: "dana", name: "Dana Reed", recordedAt },
          },
        }
      : {}),
    ...(preparing
      ? {
          assessments: [],
          reviews: { revision: reviewRevisionSchema.parse(0), requests: [], assessments: [] },
          managerRecommendation: null,
        }
      : {}),
    ...(state === "incomplete"
      ? { requested: null, summary: "", submission: { version: 1, answers: [] } }
      : {}),
  };
  const revision: IntakeState["workingRevision"] = {
    kind: state === "correction" ? "correction" : "revision",
    reason: "Include accessible transport to the venue.",
    content: { ...intakeContent(application), requested: "28000.00" },
  };

  return {
    status: "ok",
    ...encodeApplicationDetail({ application, round }),
    workspaceSlug: "alder",
    recommendationVersion: 0,
    intake: {
      revision: 2,
      workingRevision: state === "revision" || state === "correction" ? revision : null,
      history:
        state === "history"
          ? [
              {
                revision: 2,
                action: "application.revision_recorded",
                actor: "Dana Reed",
                provenance: { interface: "mcp", clientId: "example-client" },
                reason: revision.reason,
                recordedAt,
                before: encodeApplicationDetail({
                  application: { ...original, version: materialVersionSchema.parse(1) },
                  round,
                }).application,
                after: encodeApplicationDetail({
                  application: {
                    ...original,
                    version: materialVersionSchema.parse(2),
                    requested: fromMinorUnits(2800000n),
                  },
                  round,
                }).application,
              },
            ]
          : [],
    },
  };
};

const ApplicationSession = ({ initial }: { initial: Page }) => {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ ...applicationOptions("alder", publicId), initialData: initial });
  const page = data.status === "ok" ? data : initial;
  const { application, round: context } = decodeApplicationDetail(page);
  const session: IntakeSession = {
    data: workspaceIntakeData(client, "alder", publicId, page.intake),
    onDeleted: () =>
      navigate({
        to: "/app/$workspaceSlug/rounds/$roundRef",
        params: { workspaceSlug: "alder", roundRef: "community-k7m2p9x4n6rt" },
      }),
  };

  return (
    <ApplicationView
      application={application}
      round={context}
      intake={session}
      intakeState={page.intake}
    />
  );
};

const ApplicationManagementPreview = ({
  state = "incomplete",
}: {
  state?: Parameters<typeof fixture>[0];
}) => (
  <StoryEnvironment path="/app/alder/applications/neighbour-table">
    <GrantmakingDrafts>
      <ApplicationContainedPreview locationKey={original.title}>
        <ApplicationSession initial={fixture(state)} />
      </ApplicationContainedPreview>
    </GrantmakingDrafts>
  </StoryEnvironment>
);

const meta = {
  title: "Features/Applications/Manage intake",
  tags: ["!autodocs"],
  component: ApplicationManagementPreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  beforeEach: ({ args }) => {
    let page = fixture(args.state ?? "incomplete");
    mocked(readApplicationHistory).mockImplementation(async () => ({
      status: "ok",
      entries: page.intake.history,
      nextCursor: null,
    }));
    mocked(readContacts).mockResolvedValue({
      status: "ok",
      workspaceName: "Alder Foundation",
      contacts,
    });
    mocked(readFundingApplicationPage).mockImplementation(async () => page);
    mocked(editApplication).mockImplementation(async ({ data }) => {
      const { application, round: context } = decodeApplicationDetail(page);
      const changed = prepareIntakeChange(
        application,
        page.intake.workingRevision,
        data.change,
        {
          userId: "dana",
          name: "Dana Reed",
          recordedAt,
        },
        {
          hasReviews: Boolean(
            application.reviews.requests.length || application.reviews.assessments.length,
          ),
          hasRecommendation: application.managerRecommendation !== null,
        },
      );
      if (!changed.ok) {
        return { status: "invalid", error: changed.error };
      }

      let updated = changed.application;
      if (
        (data.change.action === "save_content" || data.change.action === "save_revision") &&
        data.change.contactId !== undefined
      ) {
        const contactId = data.change.contactId;
        const contact = contacts.find((item) => item.id === contactId);
        updated = {
          ...changed.application,
          contactId: data.change.contactId,
          submission: {
            ...changed.application.submission,
            version: changed.application.version,
            answers: changed.application.submission?.answers ?? [],
            contact: contact?.name ?? "",
            contactEmail: contact?.email ?? "",
          },
        };
      }
      const next = roundView({
        ...round,
        applications: [{ ...application, ...updated }],
      }).applications[0]!;
      page = {
        ...page,
        ...encodeApplicationDetail({ application: next, round: context }),
        intake: {
          ...page.intake,
          revision: page.intake.revision + 1,
          workingRevision: changed.workingRevision,
        },
      };

      return { status: "ok", revision: page.intake.revision };
    });
  },
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
export const ReadyToMark: Story = { args: { state: "complete" } };
export const ReadyForReview: Story = { args: { state: "ready" } };
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
      within(canvasElement.ownerDocument.body).getByRole("dialog"),
    ).toHaveAccessibleDescription(/current application and earlier versions/);
  },
};
export const History: Story = {
  args: { state: "history" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "View version history" }));
    const disclosure = await canvas.findByText("Application history");
    await userEvent.click(disclosure);
    const audit = within(disclosure.closest("details")!);

    await expect(audit.getByText("via MCP client example-client")).toBeVisible();

    await userEvent.click(audit.getByText(/Previous material \(Version/));
    await userEvent.click(audit.getByText(/Recorded material \(Version/));

    await waitFor(async () =>
      expect(audit.getByText("Include accessible transport to the venue.")).toBeVisible(),
    );
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

    await expect(within(canvasElement.ownerDocument.body).getByRole("dialog")).toHaveTextContent(
      original.title,
    );
  },
};

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
  return within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
};

export const ConfirmWithdraw: Story = {
  args: { state: "awaiting-reviews" },
  play: async (context) => {
    const dialog = await openWithdrawal(context);

    await expect(dialog.getByText(/outstanding review request/)).toBeVisible();
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

export const SeparateEditingScopes: Story = {
  args: { state: "complete" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit application details" }));
    let form = within(canvas.getByRole("form", { name: "Edit application details" }));

    await expect(form.queryByRole("textbox", { name: "Project title" })).not.toBeInTheDocument();
    await expect(
      form.queryByRole("textbox", { name: "Applicant’s response" }),
    ).not.toBeInTheDocument();

    const amount = form.getByRole("textbox", { name: "Requested amount" });
    await userEvent.clear(amount);
    await userEvent.type(amount, "28000");
    await userEvent.click(form.getByRole("button", { name: "Close" }));
    await userEvent.click(canvas.getByRole("button", { name: "Edit applicant submission" }));
    form = within(canvas.getByRole("form", { name: "Edit applicant submission" }));

    await expect(form.queryByRole("textbox", { name: "Project title" })).not.toBeInTheDocument();
    await expect(form.queryByRole("textbox", { name: "Applicant" })).not.toBeInTheDocument();
    await expect(form.queryByRole("textbox", { name: "Requested amount" })).not.toBeInTheDocument();

    await userEvent.type(
      form.getAllByRole("textbox", { name: "Applicant’s response" })[0]!,
      " More detail.",
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await expect(await canvas.findByText("€24,000 requested")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Mark ready for review" })).toBeDisabled();

    await userEvent.click(
      canvas.getByRole("button", { name: "Continue editing application details" }),
    );
    form = within(canvas.getByRole("form", { name: "Edit application details" }));

    await expect(form.getByRole("textbox", { name: "Requested amount" })).toHaveValue("28000");
    await expect(form.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.click(form.getByRole("button", { name: "Keep my changes" }));
    form = within(canvas.getByRole("form", { name: "Edit application details" }));
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await expect(await canvas.findByText("€28,000 requested")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Mark ready for review" })).toBeEnabled();
  },
};

export const EditContactAndProjectDates: Story = {
  args: { state: "complete" },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const panel = within(canvas.getByRole("complementary", { name: "Application workspace" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Application actions" }));

    await expect(
      body.queryByRole("menuitem", { name: "Edit applicant submission" }),
    ).not.toBeInTheDocument();
    await expect(
      body.queryByRole("menuitem", { name: "Edit application details" }),
    ).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await expect(canvas.queryByText("Reference")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Edit application details" }));
    let form = within(canvas.getByRole("form", { name: "Edit application details" }));
    await userEvent.click(await form.findByRole("button", { name: /Applicant contact/ }));
    await userEvent.click(await body.findByRole("option", { name: /Sam Morgan/ }));
    await userEvent.clear(form.getByRole("textbox", { name: "Project dates" }));
    await userEvent.type(
      form.getByRole("textbox", { name: "Project dates" }),
      "April–September 2027",
    );

    await expect(mocked(editApplication)).not.toHaveBeenCalled();

    await userEvent.click(form.getByRole("button", { name: "Close" }));

    await expect(panel.getByText("March–August 2027")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Continue editing application details" }),
    );
    form = within(canvas.getByRole("form", { name: "Edit application details" }));

    await expect(form.getByRole("textbox", { name: "Project dates" })).toHaveValue(
      "April–September 2027",
    );
    await expect(form.getByRole("button", { name: /Applicant contact/ })).toHaveTextContent(
      "Sam Morgan",
    );

    mocked(editApplication).mockResolvedValueOnce({ status: "unavailable" });
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

    await userEvent.click(canvas.getByRole("button", { name: "Edit application details" }));
    form = within(canvas.getByRole("form", { name: "Edit application details" }));
    await userEvent.clear(form.getByRole("textbox", { name: "Project dates" }));
    await userEvent.click(form.getByRole("button", { name: "Discard changes" }));

    await expect(panel.getByText("April–September 2027")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Edit application details" })).toBeVisible();
  },
};
