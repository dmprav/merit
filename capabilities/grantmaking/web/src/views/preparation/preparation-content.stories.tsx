import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";
import { expect, fn, waitFor, within } from "storybook/test";

import { roundView } from "@merit/grantmaking/api";
import { makeRound } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";
import type { PreparationData } from "@merit/rounds-web/contracts";
import { ApplicationPage } from "@merit/ui/application-shell";

import { GrantmakingMessagesProvider } from "../../messages";
import { GrantmakingDrafts } from "../drafts";
import { FundingRoundView } from "../rounds/funding-round-view";

const deleteRound = fn<PreparationData["delete"]>();
const onDeleted = fn<() => Promise<void>>();
const round = roundView(makeRound({ title: "Community grants" }));

const DeletionPreview = () => (
  <FundingRoundView
    round={round}
    preparation={{
      data: {
        draftKey: "deletion-preview",
        state: { revision: 1, managers: [], budgetHistory: [] },
        save: async () => ({ status: "unavailable" }),
        delete: deleteRound,
        refresh: async () => {},
        refreshCurrent: async () => {},
      },
      onDeleted,
    }}
  />
);

const meta = {
  title: "Features/Funding rounds/Deletion recovery",
  tags: ["!autodocs"],
  component: DeletionPreview,
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    deleteRound.mockReset().mockResolvedValue({ status: "ok" });
    onDeleted
      .mockReset()
      .mockRejectedValueOnce(new Error("Navigation failed"))
      .mockResolvedValue(undefined);
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createQueryClient()}>
        <GrantmakingMessagesProvider>
          <GrantmakingDrafts>
            <ApplicationPage
              width="full"
              locationKey={round.title}
              breadcrumb={null}
              breadcrumbLabel="Breadcrumb"
            >
              <Story />
            </ApplicationPage>
          </GrantmakingDrafts>
        </GrantmakingMessagesProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof DeletionPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ReturnFailed: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("menuitem", { name: "Delete round" }));
    await userEvent.click(body.getByRole("button", { name: "Delete round" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Round deleted.");
    await expect(canvas.getByRole("alert")).toHaveTextContent("We couldn’t open the rounds list");
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Return to funding rounds" })).toHaveFocus(),
    );
    await expect(deleteRound).toHaveBeenCalledOnce();
    // React Aria keeps the closed confirmation's pending announcement for seven seconds,
    // labelled by a button that no longer exists. Clear it, as a remount would, so the
    // accessibility scan and browser suite need not wait for React Aria's timer.
    for (const log of canvasElement.ownerDocument.querySelectorAll(
      "[data-live-announcer] [role=log]",
    )) {
      log.replaceChildren();
    }
  },
};
