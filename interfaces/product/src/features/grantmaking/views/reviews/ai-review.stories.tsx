import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQueryClient } from "@tanstack/react-query";
import { expect, mocked, within } from "storybook/test";

import { ApplicationView } from "@merit/grantmaking-web/applications";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { ApplicationContainedPreview } from "@merit/grantmaking-web/testing";
import { roundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { aiReviewFixture } from "@merit/reviews-web/testing";
import { reviewRevisionSchema } from "@merit/reviews/domain";

import { StoryEnvironment } from "../../../../../tests/storybook";
import { workspaceAiReviewData } from "../../data/reviews/ai-review-data";
import { runAiReview } from "../../data/server/reviews/ai-reviews.functions";

const round = getExampleRound();
const provider = { provider: "OpenAI", model: "gpt-5.1" };

const AiReviewPreview = ({ refreshFailure = false }: { refreshFailure?: boolean }) => {
  const client = useQueryClient();
  // Without assessments the section sits within the first screen, beside the recommendation.
  const application = roundView({
    ...round,
    applications: [
      {
        ...round.applications[0]!,
        summary: "",
        reviews: { revision: reviewRevisionSchema.parse(0), requests: [], assessments: [] },
      },
    ],
  }).applications[0]!;
  const data = workspaceAiReviewData(client, "alder", "workshop-saturdays", {
    reviews: [],
    availability: "available",
    provider,
  });

  return (
    <ApplicationContainedPreview locationKey={application.title}>
      <ApplicationView
        application={application}
        round={round}
        tab="reviews"
        aiReviewData={{
          ...data,
          refresh: async () => {
            if (refreshFailure) {
              throw new Error("Preview refresh failure");
            }
          },
        }}
      />
    </ApplicationContainedPreview>
  );
};

const meta = {
  title: "Features/Applications/AI review",
  tags: ["!autodocs"],
  component: AiReviewPreview,
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
} satisfies Meta<typeof AiReviewPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

type Context = Parameters<NonNullable<Story["play"]>>[0];

const startRun = async ({ canvas, userEvent }: Context) => {
  const section = within(canvas.getByRole("region", { name: "AI review" }));
  await expect(
    section.getByText(
      "Sends this application's current material and the round's criteria to OpenAI (gpt-5.1). Takes up to about two minutes.",
    ),
  ).toBeVisible();
  await userEvent.click(section.getByRole("button", { name: "Run AI review" }));
  return section;
};

export const Running: Story = {
  beforeEach: () => {
    mocked(runAiReview).mockImplementation(() => new Promise(() => {}));
  },
  play: async (context) => {
    const section = await startRun(context);
    await expect(section.getByRole("status")).toHaveTextContent("Running the AI review.");
    await expect(section.getByRole("button", { name: "Running AI review…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};

export const Failed: Story = {
  beforeEach: () => {
    mocked(runAiReview).mockResolvedValueOnce({ status: "failed" });
  },
  play: async (context) => {
    const section = await startRun(context);
    await expect(await section.findByRole("alert")).toHaveTextContent(
      "The AI review couldn't be completed. Nothing was saved.",
    );
    await expect(section.getByRole("button", { name: "Try again" })).toBeEnabled();
  },
};

export const ConsentWithdrawnDuringRun: Story = {
  beforeEach: () => {
    mocked(runAiReview).mockResolvedValueOnce({
      status: "not_available",
      availability: "consent_required",
    });
  },
  play: async (context) => {
    const section = await startRun(context);
    await expect(
      await section.findByText(/must turn on Merit AI for this workspace/),
    ).toBeVisible();
    await expect(section.queryByRole("button", { name: /Run/ })).not.toBeInTheDocument();
  },
};

export const SavedButRefreshFailed: Story = {
  args: { refreshFailure: true },
  beforeEach: () => {
    mocked(runAiReview).mockResolvedValueOnce({ status: "ok", review: aiReviewFixture() });
  },
  play: async (context) => {
    await startRun(context);
    // The failed read retries quietly for about four seconds before it is reported.
    const toast = await within(context.canvasElement.ownerDocument.body).findByRole(
      "alertdialog",
      { name: "Saved, but the latest AI reviews could not be loaded." },
      { timeout: 8000 },
    );
    await expect(within(toast).getByRole("button", { name: "Refresh" })).toBeEnabled();
  },
};
