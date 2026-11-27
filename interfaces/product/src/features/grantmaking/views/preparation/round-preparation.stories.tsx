import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { expect, fn, waitFor, mocked, within } from "storybook/test";

import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { FundingRoundPreview as FundingRoundView } from "@merit/grantmaking-web/testing";
import { encodeRoundPage, roundView, type RoundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import type { PreparationState } from "@merit/rounds-web/contracts";
import {
  PreparationForm,
  RoundConflictBanner,
  preparationDraft,
  type PreparationDraft,
  type PreparationSession,
} from "@merit/rounds-web/preparation";
import { ApplicationPage, ApplicationStage } from "@merit/ui/application-shell";
import { PageHeader } from "@merit/ui/page-header";

import { StoryEnvironment } from "../../../../../tests/storybook";
import { workspacePreparationData } from "../../data/preparation/workspace-data";
import { readFundingRoundPage } from "../../data/server/funding-round.functions";
import { readBudgetHistory } from "../../data/server/history.functions";
import { deleteRound, editRound } from "../../data/server/preparation/preparation.functions";

const example = { ...getExampleRound(), managerUserId: "dana" };
const preparation: PreparationState = {
  revision: 2,
  managers: [
    { userId: "dana", name: "Dana Reed", email: "dana@example.test" },
    { userId: "leah", name: "Leah Martin", email: "leah@example.test" },
  ],
  budgetHistory: [
    {
      revision: 2,
      action: "budget",
      before: encodeMoney(fromMinorUnits(7000000n)),
      after: encodeMoney(example.budget!),
      reason: "Additional funding approved for accessible venues.",
      actor: "Dana Reed",
      provenance: { interface: "mcp", clientId: "example-client" },
      recordedAt: "2026-11-01T10:00:00Z",
    },
  ],
};

const ConflictEditor = () => {
  const [draft, setDraft] = useState<PreparationDraft>(() => ({
    ...preparationDraft("purpose", example, 1),
    value: { purpose: "Community partnerships" },
  }));

  const latest = {
    ...example,
    title: "Neighbourhood grants",
    purpose: "Support accessible activities led by residents.",
  };
  const isConflict = draft.revision !== 2;

  return (
    <>
      <PageHeader title="Round purpose" />
      <PreparationForm
        key={draft.revision}
        draft={draft}
        round={latest}
        isConflict={isConflict}
        onChange={setDraft}
        onCancel={() => setDraft(preparationDraft("purpose", latest, 2))}
        onSave={async () => null}
        beforeFields={
          isConflict && (
            <RoundConflictBanner
              section="purpose"
              round={latest}
              onKeepMine={() =>
                setDraft({
                  ...draft,
                  revision: 2,
                  baseline: preparationDraft("purpose", latest, 2).baseline,
                })
              }
              onUseSaved={() => setDraft(preparationDraft("purpose", latest, 2))}
            />
          )
        }
      />
    </>
  );
};

const RoundSession = ({
  round,
  onDeleted,
}: {
  round: RoundView;
  onDeleted?: PreparationSession["onDeleted"];
}) => {
  const client = useQueryClient();
  const navigate = useNavigate();
  const session: PreparationSession = {
    data: workspacePreparationData(client, "alder", "k7m2p9x4n6rt", preparation),
    onDeleted:
      onDeleted ??
      (() => navigate({ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } })),
  };
  return <FundingRoundView round={round} preparation={session} />;
};

const RoundManagementPreview = ({
  empty = false,
  reassign = false,
  longManager = false,
  conflict = false,
  onDeleted,
}: {
  empty?: boolean;
  reassign?: boolean;
  longManager?: boolean;
  conflict?: boolean;
  onDeleted?: PreparationSession["onDeleted"];
}) => {
  const round: RoundView = roundView({
    ...example,
    manager: longManager ? "Alexandria Montgomery-Worthington" : example.manager,
    applications: empty ? [] : example.applications,
  });
  if (reassign) {
    round.managerNeedsReassignment = true;
  }

  return (
    <StoryEnvironment path="/app/alder/rounds/community">
      <GrantmakingDrafts>
        <ApplicationStage>
          <ApplicationPage
            locationKey="round"
            breadcrumb={null}
            breadcrumbLabel="Breadcrumb"
            width="full"
            contained
          >
            {conflict ? <ConflictEditor /> : <RoundSession round={round} onDeleted={onDeleted} />}
          </ApplicationPage>
        </ApplicationStage>
      </GrantmakingDrafts>
    </StoryEnvironment>
  );
};

const meta = {
  title: "Features/Funding rounds/Manage round",
  tags: ["!autodocs"],
  component: RoundManagementPreview,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  beforeEach: () => {
    mocked(readBudgetHistory).mockReset().mockResolvedValue({
      status: "ok",
      entries: preparation.budgetHistory,
      nextCursor: null,
    });
    mocked(readFundingRoundPage)
      .mockReset()
      .mockResolvedValue({
        status: "ok",
        workspaceSlug: "alder",
        round: encodeRoundPage(example),
        preparation,
      });
    mocked(editRound).mockReset().mockResolvedValue({ status: "ok", revision: 3 });
    mocked(deleteRound).mockReset().mockResolvedValue({ status: "ok" });
  },
} satisfies Meta<typeof RoundManagementPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvas, canvasElement }) => {
    const manager = await canvas.findByRole("button", { name: "Assign manager: Dana Reed" });
    const name = within(manager).getByText("Dana Reed");
    // Measure the name in its final font: a wider fallback face can wrap it before the font loads.
    await canvasElement.ownerDocument.fonts.ready;
    await expect(name.getBoundingClientRect().height).toBeLessThanOrEqual(
      Number.parseFloat(getComputedStyle(name).lineHeight),
    );
  },
};
export const CriteriaWithReviews: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Edit criteria" }));
    const editor = within(canvasElement);

    await expect(editor.getByText(/Saving preserves earlier criteria/)).toBeVisible();
  },
};
export const ManagerNeedsReassignment: Story = {
  args: { reassign: true },
  play: Overview.play,
};
export const LongManager: Story = { args: { reassign: true, longManager: true } };
export const AssignManager: Story = {
  args: { reassign: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Assign manager:/ }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));

    await expect(dialog.getByRole("textbox", { name: "Search people" })).toHaveFocus();
    await expect(dialog.queryByRole("heading", { name: "Assign manager" })).not.toBeInTheDocument();
    await expect(dialog.queryByRole("button", { name: "Close dialog" })).not.toBeInTheDocument();
  },
};
export const ResumePurpose: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Edit purpose" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      body.getByRole("textbox", { name: "Purpose" }),
      " Include transport support.",
    );
    await userEvent.click(body.getByRole("button", { name: "Close" }));
    await userEvent.click(canvas.getByRole("button", { name: "Continue editing purpose" }));

    await expect(body.getByRole("textbox", { name: "Purpose" })).toHaveValue(
      `${example.purpose} Include transport support.`,
    );
  },
};
export const BudgetHistory: Story = {
  beforeEach: () => {
    mocked(readBudgetHistory)
      .mockClear()
      .mockImplementation(async ({ data }) =>
        data.after === "earlier"
          ? {
              status: "ok",
              entries: [
                {
                  revision: 1,
                  action: "budget",
                  before: null,
                  after: encodeMoney(fromMinorUnits(7000000n)),
                  reason: null,
                  actor: "Leah Martin",
                  provenance: { interface: "web" },
                  recordedAt: "2026-10-01T10:00:00Z",
                },
              ],
              nextCursor: null,
            }
          : { status: "ok", entries: preparation.budgetHistory, nextCursor: "earlier" },
      );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Edit budget:/ }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    await expect(readBudgetHistory).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole("button", { name: "Budget history" }));

    await waitFor(() => expect(dialog.getByText("via MCP client example-client")).toBeVisible());
    await expect(
      dialog.getByText("Additional funding approved for accessible venues."),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Load older entries" }));
    await expect(await dialog.findByText("Recorded by Leah Martin")).toBeVisible();
    await expect(dialog.getByText("via Merit web")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Not set → €70,000" })).toBeVisible();
  },
};
export const BudgetReasonRequired: Story = {
  play: async (context) => {
    await context.userEvent.click(
      await context.canvas.findByRole("button", { name: /^Edit budget:/ }),
    );
    const dialog = within(
      await within(context.canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await context.userEvent.clear(dialog.getByRole("textbox", { name: "Round budget" }));
    await context.userEvent.type(dialog.getByRole("textbox", { name: "Round budget" }), "95000");
    await context.userEvent.click(dialog.getByRole("button", { name: "Update budget" }));

    await expect(dialog.getByRole("textbox", { name: "Reason for change" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    // The draft status sits in the footer beside Discard, never above the fields.
    const status = dialog.getByRole("status");
    await expect(status).toHaveTextContent("Draft kept in this tab");
    await expect(status.closest("[data-dialog-footer]")).toContainElement(
      dialog.getByRole("button", { name: "Discard changes" }),
    );
  },
};
export const ConcurrentEdits: Story = { args: { conflict: true } };
export const ResolvedConflict: Story = {
  args: { conflict: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Keep my changes" }));

    await expect(canvas.getByRole("textbox", { name: "Purpose" })).toHaveValue(
      "Community partnerships",
    );
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeEnabled();
  },
};
export const DeleteEmptyRound: Story = {
  args: { empty: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "More actions" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("menuitem", { name: "Delete round" }));

    await expect(await body.findByRole("dialog")).toHaveTextContent(example.title);
  },
};
export const DeleteFailure: Story = {
  args: { empty: true },
  beforeEach: () => {
    mocked(deleteRound).mockResolvedValueOnce({ status: "unavailable" });
  },
  play: async (context) => {
    await DeleteEmptyRound.play!(context);
    const dialog = within(
      await within(context.canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await context.userEvent.click(dialog.getByRole("button", { name: "Delete round" }));

    await waitFor(async () => expect(await dialog.findByRole("alert")).toBeVisible());
  },
};

const returnToList = fn<PreparationSession["onDeleted"]>();

/** A committed deletion confirms itself in a toast and returns to the rounds list. */
export const RoundDeleted: Story = {
  name: "Round deleted",
  args: { empty: true, onDeleted: returnToList },
  beforeEach: () => {
    mocked(deleteRound).mockResolvedValue({ status: "ok" });
    returnToList.mockReset().mockResolvedValue(undefined);
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("menuitem", { name: "Delete round" }));
    await userEvent.click(body.getByRole("button", { name: "Delete round" }));
    const toast = await body.findByRole("alertdialog", { name: "Round deleted" });
    await waitFor(() => expect(toast).toBeVisible());
    await waitFor(() => expect(returnToList).toHaveBeenCalledOnce());
    await expect(deleteRound).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Delete this empty round?" })).toBeNull(),
    );
  },
};

export const RenameRound: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: example.title }));
    const input = canvas.getByRole("textbox", { name: "Edit round name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Community partnerships");

    await expect(input).toHaveFocus();
  },
};
export const CommitteeDate: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Edit committee date:/ }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));

    await expect(dialog.getByRole("textbox", { name: "Committee date" })).toHaveFocus();
    await expect(
      dialog.queryByRole("heading", { name: "Edit committee date" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible());
    await expect(dialog.queryByRole("button", { name: "Close dialog" })).not.toBeInTheDocument();
  },
};
