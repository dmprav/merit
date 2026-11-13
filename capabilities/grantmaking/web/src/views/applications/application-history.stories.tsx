import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { encodeApplicationDetail } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { fromMinorUnits } from "@merit/money";
import { ApplicationPage } from "@merit/ui/application-shell";
import { PageHeader } from "@merit/ui/page-header";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationHistory } from "./application-history";
import type { ApplicationHistoryEntry } from "./application-history-model";

const round = getExampleRound();
const first = round.applications[0];
if (!first) {
  throw new Error("The history story requires the first example application");
}
const second = {
  ...first,
  version: materialVersionSchema.parse(2),
  requested: fromMinorUnits(2800000n),
  submission: { ...first.submission!, version: materialVersionSchema.parse(2) },
};
const third = {
  ...second,
  version: materialVersionSchema.parse(3),
  submission: {
    ...second.submission,
    version: materialVersionSchema.parse(3),
    answers: second.submission.answers.map((answer, index) =>
      index === 0
        ? {
            ...answer,
            question: "Project purpose and access",
            response: `${answer.response}\n\nResidents can also book by phone. We will ask about access needs when taking bookings.`,
          }
        : answer,
    ),
  },
};
const history = [
  {
    revision: 2,
    action: "application.revision_recorded",
    actor: "Dana Reed",
    provenance: { interface: "web" },
    reason: "The applicant added accessible transport to the requested budget.",
    recordedAt: "2027-01-15T10:00:00Z",
    before: encodeApplicationDetail({ round, application: first }).application,
    after: encodeApplicationDetail({ round, application: second }).application,
  },
  {
    revision: 3,
    action: "application.revision_recorded",
    actor: "Dana Reed",
    provenance: { interface: "web" },
    reason: "The applicant clarified booking and access arrangements.",
    recordedAt: "2027-01-17T10:00:00Z",
    before: encodeApplicationDetail({ round, application: second }).application,
    after: encodeApplicationDetail({ round, application: third }).application,
  },
] satisfies [ApplicationHistoryEntry, ApplicationHistoryEntry];

const HistoryPreview = ({ scenario }: { scenario: "versions" | "missing" | "empty" }) => (
  <GrantmakingMessagesProvider>
    <ApplicationPage locationKey="history" breadcrumb={null} breadcrumbLabel="Breadcrumb">
      <PageHeader title="Version history" />
      <ApplicationHistory
        application={third}
        history={scenario === "empty" ? [] : scenario === "missing" ? history.slice(1) : history}
        initialFromVersion={scenario === "empty" ? undefined : 1}
      />
    </ApplicationPage>
  </GrantmakingMessagesProvider>
);

const meta = {
  title: "Features/Applications/Version history",
  tags: ["!autodocs"],
  component: HistoryPreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { scenario: "versions" },
} satisfies Meta<typeof HistoryPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AcrossThreeVersions: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(history[0].reason)).toBeVisible();
    await expect(canvas.getByText(history[1].reason)).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Project purpose and access" })).toBeVisible();
    await expect(canvas.getByText("Project overview", { exact: true })).toBeVisible();
  },
};
export const MissingReviewedVersion: Story = { args: { scenario: "missing" } };
export const NoEarlierSnapshot: Story = { args: { scenario: "empty" } };
