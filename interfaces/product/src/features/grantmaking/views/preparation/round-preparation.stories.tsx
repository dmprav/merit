import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { expect, waitFor, mocked, within } from "storybook/test";

import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { FundingRoundView } from "@merit/grantmaking-web/rounds";
import { roundView, type RoundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import type { PreparationState } from "@merit/rounds-web/contracts";
import { preparationDraft, type PreparationDraft } from "@merit/rounds-web/preparation";
import type { PreparationSession } from "@merit/rounds-web/preparation";
import { LatestPreparation, PreparationForm } from "@merit/rounds-web/preparation";
import { ApplicationPage } from "@merit/ui/application-shell";
import { PageHeader } from "@merit/ui/page-header";

import { StoryEnvironment } from "../../../../../tests/storybook";
import { workspacePreparationData } from "../../data/preparation/workspace-data";
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
      revision: 1,
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

const ConflictEditor = ({ safe = false }: { safe?: boolean }) => {
  const [draft, setDraft] = useState<PreparationDraft>(() => ({
    ...preparationDraft("purpose", example, 1),
    value: { purpose: "Community partnerships" },
  }));

  const latest = {
    ...example,
    title: "Neighbourhood grants",
    purpose: safe ? example.purpose : "Support accessible activities led by residents.",
  };

  return (
    <>
      <PageHeader title="Round purpose" />
      <PreparationForm
        key={draft.revision}
        draft={draft}
        round={latest}
        isConflict={draft.revision !== 2}
        onChange={setDraft}
        onCancel={() => setDraft(preparationDraft("purpose", latest, 2))}
        onSave={async () => null}
        beforeFields={
          draft.revision !== 2 && (
            <LatestPreparation
              draft={draft}
              round={latest}
              revision={2}
              managers={preparation.managers}
              onReconcile={(merged) => setDraft(merged)}
            />
          )
        }
      />
    </>
  );
};

const RoundSession = ({ round }: { round: RoundView }) => {
  const client = useQueryClient();
  const navigate = useNavigate();
  const session: PreparationSession = {
    data: workspacePreparationData(client, "alder", "k7m2p9x4n6rt", preparation),
    onDeleted: () =>
      navigate({ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } }),
  };
  return <FundingRoundView round={round} preparation={session} />;
};

const RoundManagementPreview = ({
  empty = false,
  reassign = false,
  conflict = false,
  safe = false,
}: {
  empty?: boolean;
  reassign?: boolean;
  conflict?: boolean;
  safe?: boolean;
}) => {
  const round: RoundView = roundView({
    ...example,
    applications: empty ? [] : example.applications,
  });
  if (reassign) {
    round.managerNeedsReassignment = true;
  }

  return (
    <StoryEnvironment path="/app/alder/rounds/community">
      <GrantmakingDrafts>
        <ApplicationPage
          locationKey="round"
          breadcrumb={null}
          breadcrumbLabel="Breadcrumb"
          width="full"
        >
          {conflict ? <ConflictEditor safe={safe} /> : <RoundSession round={round} />}
        </ApplicationPage>
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
    mocked(editRound).mockResolvedValue({ status: "unavailable" });
    mocked(deleteRound).mockResolvedValue({ status: "unavailable" });
  },
} satisfies Meta<typeof RoundManagementPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const CriteriaWithReviews: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Edit criteria" }));
    const editor = within(canvasElement);

    await expect(editor.getByText(/Saving preserves earlier criteria/)).toBeVisible();
  },
};
export const ManagerNeedsReassignment: Story = { args: { reassign: true } };
export const AssignManager: Story = {
  args: { reassign: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Assign manager:/ }));
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));

    await expect(dialog.getByRole("textbox", { name: "Search people" })).toHaveFocus();
    await expect(dialog.queryByRole("heading", { name: "Assign manager" })).not.toBeInTheDocument();
    await waitFor(() => expect(dialog.getByRole("button", { name: "Close" })).toBeVisible());
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
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Edit budget:/ }));
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.click(dialog.getByText("Budget history"));

    await waitFor(() => expect(dialog.getByText("via MCP client example-client")).toBeVisible());
    await waitFor(async () =>
      expect(dialog.getByText("Additional funding approved for accessible venues.")).toBeVisible(),
    );
  },
};
export const BudgetReasonRequired: Story = {
  play: async (context) => {
    await BudgetHistory.play!(context);
    const dialog = within(within(context.canvasElement.ownerDocument.body).getByRole("dialog"));
    await context.userEvent.clear(dialog.getByRole("textbox", { name: "Round budget" }));
    await context.userEvent.type(dialog.getByRole("textbox", { name: "Round budget" }), "95000");
    await context.userEvent.click(dialog.getByRole("button", { name: "Update budget" }));

    await expect(dialog.getByRole("textbox", { name: "Reason for change" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};
export const ConcurrentEdits: Story = { args: { conflict: true } };
export const SafeMerge: Story = { args: { conflict: true, safe: true } };
export const ResolvedConflict: Story = {
  args: { conflict: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /Value to keep for Purpose/ }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", { name: "Keep my value" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Apply choices to draft" }));

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

    await expect(body.getByRole("dialog")).toHaveTextContent(example.title);
  },
};
export const DeleteFailure: Story = {
  args: { empty: true },
  play: async (context) => {
    await DeleteEmptyRound.play!(context);
    const dialog = within(within(context.canvasElement.ownerDocument.body).getByRole("dialog"));
    await context.userEvent.click(dialog.getByRole("button", { name: "Delete round" }));

    await waitFor(async () => expect(await dialog.findByRole("alert")).toBeVisible());
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
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));

    await expect(dialog.getByRole("textbox", { name: "Committee date" })).toHaveFocus();
    await expect(
      dialog.queryByRole("heading", { name: "Edit committee date" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible());
    await expect(dialog.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  },
};
