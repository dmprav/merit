import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import type { TableSort } from "@merit/tables";
import { ApplicationPage } from "@merit/ui/application-shell";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationsOverviewPreview as ApplicationsOverview } from "../../testing/application-list-preview";

const rounds = [
  { id: "k7m2p9x4n6rt", title: "Local Connections 2027" },
  { id: "h7m2p9x4n6rt", title: "Community grants 2028" },
  { id: "0123456789ab", title: "Empty round" },
];

const Preview = (
  props: Omit<
    ComponentProps<typeof ApplicationsOverview>,
    "roundId" | "sorting" | "onRoundChange" | "onSortingChange"
  >,
) => {
  const [roundId, setRoundId] = useState("");
  const [sorting, setSorting] = useState<TableSort>(null);
  return (
    <ApplicationsOverview
      {...props}
      roundId={roundId}
      onRoundChange={setRoundId}
      sorting={sorting}
      onSortingChange={setSorting}
    />
  );
};

const meta = {
  title: "Features/Applications/Workspace overview",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  component: Preview,
  args: {
    rounds,
    applications: [
      {
        id: "b8q3w5j7c2df",
        title: "Workshop Saturdays",
        applicant: "Repair Collective",
        roundId: "k7m2p9x4n6rt",
        roundTitle: "Local Connections 2027",
        intakeStatus: "ready",
        withdrawn: false,
        requested: null,
        reviews: { current: 0, outdated: 1, outstanding: 1, unknown: 0 },
        criteriaChanged: true,
        recommendation: {
          position: "Defer",
          outdated: true,
          allocation: { minorUnits: "0", currency: "EUR" as const },
        },
      },
      {
        id: "0123456789ac",
        title: "Neighbour Table",
        applicant: null,
        roundId: "h7m2p9x4n6rt",
        roundTitle: "Community grants 2028",
        intakeStatus: "in_preparation",
        withdrawn: false,
        requested: null,
        reviews: { current: 0, outdated: 0, outstanding: 0, unknown: 0 },
        criteriaChanged: false,
        recommendation: null,
      },
    ],
    renderApplicationLink: (item, label, reviews) => (
      <a href={`/app/example/applications/${item.id}${reviews ? "?tab=reviews" : ""}`}>{label}</a>
    ),
    renderRoundLink: (item) => (
      <a href={`/app/example/rounds/${item.roundId}`}>{item.roundTitle}</a>
    ),
  },
  decorators: [
    (Story) => (
      <ApplicationPage
        locationKey="applications"
        breadcrumb={null}
        breadcrumbLabel="Breadcrumb"
        width="full"
      >
        <GrantmakingMessagesProvider>
          <Story />
        </GrantmakingMessagesProvider>
      </ApplicationPage>
    ),
  ],
} satisfies Meta<typeof Preview>;

export default meta;

export const AcrossRounds: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("2 of 2 applications")).toBeVisible();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    await userEvent.click(body.getByRole("button", { name: "Round All rounds" }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "Empty round",
      }),
    );
    await expect(canvas.getByText("No applications in this round yet.")).toBeVisible();
    await expect(canvas.getByText("0 of 2 applications")).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "Clear filters" }));
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByText("2 of 2 applications")).toBeVisible();
  },
};
export const Filtered: StoryObj<typeof meta> = {
  args: { query: "Repair", filter: { evidence: "changed" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("1 of 2 applications");
    await expect(
      canvas.getByRole("button", { name: "Remove filter: Changed evidence or criteria" }),
    ).toBeVisible();
  },
};
export const NoMatches: StoryObj<typeof meta> = {
  args: { query: "Repair", filter: { recommendation: "missing" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No applications match your search and filter.")).toBeVisible();
    await expect(canvas.getByText("0 of 2 applications")).toBeVisible();
  },
};
export const Empty: StoryObj<typeof meta> = { args: { applications: [], rounds: [] } };

export const LongAndUnknown: StoryObj<typeof meta> = {
  args: {
    applications: [
      ...meta.args.applications,
      {
        ...meta.args.applications[0]!,
        id: "long-unknown",
        title:
          "Community transport connecting rural neighbourhoods with local services and shared activities",
        applicant: "The Riverside Neighbourhood Partnership for Inclusive Community Participation",
        reviews: { current: 2, outdated: 1, outstanding: 0, unknown: 1 },
        withdrawn: true,
        requested: null,
      },
    ],
  },
};

const PagedPreview = () => {
  const [offset, setOffset] = useState(50);
  const [sorting, setSorting] = useState<TableSort>(null);
  const applications = Array.from({ length: 55 }, (_, index) => ({
    ...meta.args.applications[index % 2]!,
    id: `project-${index}`,
    title: `Community project ${String(index + 1).padStart(2, "0")}`,
  }));
  return (
    <ApplicationsOverview
      {...meta.args}
      applications={applications.slice(offset, offset + 50)}
      roundId=""
      onRoundChange={() => {}}
      sorting={sorting}
      onSortingChange={setSorting}
      pagination={{
        total: 55,
        matching: 55,
        offset,
        loading: false,
        failed: false,
        onPrevious: () => setOffset(0),
        onNext: () => setOffset(50),
        onRetry: () => {},
      }}
    />
  );
};

export const Paged: StoryObj<typeof meta> = {
  render: () => <PagedPreview />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("51–55 of 55 applications")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Next" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Previous" }));
    await expect(canvas.getByText("1–50 of 55 applications")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(canvas.getByText("51–55 of 55 applications")).toBeVisible();
  },
};

export const PagedNoMatches: StoryObj<typeof meta> = {
  args: {
    applications: [],
    query: "Missing",
    pagination: {
      total: 55,
      matching: 0,
      offset: 0,
      loading: false,
      failed: false,
      onPrevious: () => {},
      onNext: () => {},
      onRetry: () => {},
    },
  },
};

const RecoveryPreview = () => {
  const [offset, setOffset] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const applications = Array.from({ length: 55 }, (_, index) => ({
    ...meta.args.applications[index % 2]!,
    id: `project-${index}`,
    title: `Community project ${String(index + 1).padStart(2, "0")}`,
  }));
  return (
    <ApplicationsOverview
      {...meta.args}
      applications={applications.slice(offset, offset + 50)}
      roundId=""
      onRoundChange={() => {}}
      sorting={null}
      onSortingChange={() => {}}
      pagination={{
        total: 55,
        matching: 55,
        offset,
        failed,
        retrying,
        loading: retrying,
        onPrevious: () => setOffset(0),
        onNext: () => setFailed(true),
        onRetry: () => {
          setRetrying(true);
          setTimeout(() => {
            setOffset(50);
            setFailed(false);
            setRetrying(false);
          }, 1500);
        },
      }}
    />
  );
};

export const PagedRecovery: StoryObj<typeof meta> = { render: () => <RecoveryPreview /> };

export const CombinedCriteria: StoryObj<typeof meta> = {
  args: { filter: { participation: "active", reviews: "awaiting", evidence: "changed" } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("1 of 2 applications");
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(body.getByRole("button", { name: "Participation Active" })).toBeVisible(),
    );
    await waitFor(() =>
      expect(body.getByRole("button", { name: "Reviews Awaiting reviews" })).toBeVisible(),
    );
    await waitFor(() =>
      expect(
        body.getByRole("button", { name: "Evidence Changed evidence or criteria" }),
      ).toBeVisible(),
    );
  },
};

export const FilterCriteria: StoryObj<typeof meta> = {
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    const criterion = body.getByRole("button", { name: "Readiness Any" });
    for (const label of ["Participation", "Readiness", "Reviews", "Evidence", "Recommendation"]) {
      await waitFor(() => expect(body.getByRole("button", { name: `${label} Any` })).toBeVisible());
    }
    await expect(canvas.getByRole("status")).toHaveTextContent("2 of 2 applications");
    await userEvent.click(criterion);
    await userEvent.keyboard("{End}{Enter}");
    await waitFor(() => expect(criterion).toHaveFocus());
    await expect(canvas.getByRole("status")).toHaveTextContent("1 of 2 applications");
    await userEvent.keyboard("{Enter}{Home}{Enter}");
    await waitFor(() => expect(criterion).toHaveFocus());
    await expect(canvas.getByRole("status")).toHaveTextContent("2 of 2 applications");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Filter" })).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    await waitFor(() => expect(body.getByRole("button", { name: "Readiness Any" })).toBeVisible());
  },
};
