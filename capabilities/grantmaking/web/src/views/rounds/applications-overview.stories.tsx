import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, userEvent, within } from "storybook/test";

import type { TableSort } from "@merit/tables";
import { ApplicationPage } from "@merit/ui/application-shell";

import { GrantmakingMessagesProvider } from "../../messages";
import { ApplicationsOverview } from "./applications-overview";

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
        reviews: { current: 0, outdated: 1, outstanding: 1, unknown: 0 },
        criteriaChanged: true,
        recommendation: { position: "Defer", outdated: true },
      },
      {
        id: "0123456789ac",
        title: "Neighbour Table",
        applicant: null,
        roundId: "h7m2p9x4n6rt",
        roundTitle: "Community grants 2028",
        intakeStatus: "in_preparation",
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
    await userEvent.click(canvas.getByRole("button", { name: "All rounds Round" }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "Empty round",
      }),
    );
    await expect(canvas.getByText("No applications in this round yet.")).toBeVisible();
    await expect(canvas.getByText("0 of 2 applications")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Clear filters" }));
    await expect(canvas.getByText("2 of 2 applications")).toBeVisible();
  },
};
export const Filtered: StoryObj<typeof meta> = {
  args: { query: "Repair", filter: "changed" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("1 of 2 applications");
    await expect(canvas.getByRole("button", { name: "Clear filters" })).toBeVisible();
  },
};
export const NoMatches: StoryObj<typeof meta> = {
  args: { query: "Repair", filter: "unwritten" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No applications match your search and filter.")).toBeVisible();
    await expect(canvas.getByText("0 of 2 applications")).toBeVisible();
  },
};
export const Empty: StoryObj<typeof meta> = { args: { applications: [], rounds: [] } };
