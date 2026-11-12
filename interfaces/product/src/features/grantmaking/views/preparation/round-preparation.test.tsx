import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert, beforeEach, expect, it, vi } from "vite-plus/test";

import { readDraftStorage, seedDraftStorage } from "@merit/drafts/testing";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { FundingRoundView } from "@merit/grantmaking-web/rounds";
import { roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits } from "@merit/money";
import { createQueryClient } from "@merit/query";
import { preparationDraft } from "@merit/rounds-web/preparation";
import {
  RoundActions,
  RoundTitle,
  RoundEditButton,
  RoundEditor,
  RoundDate,
  RoundManager,
  RoundBudget,
  RoundFeedback,
  RoundDeleteConfirmation,
} from "@merit/rounds-web/preparation";
import { usePreparationEditing } from "@merit/rounds-web/preparation";

import { WebMessagesProvider } from "../../../../app/messages";
import { workspacePreparationData } from "../../data/preparation/workspace-data";
import { createRound } from "../../data/server/creation/creation.functions";
import { deleteRound, editRound } from "../../data/server/preparation/preparation.functions";
import type { workspaceRoundsLocation } from "../../page-routing";

const navigate = vi.hoisted(() =>
  vi.fn<(location: ReturnType<typeof workspaceRoundsLocation>) => Promise<void>>(async () => {}),
);
vi.mock("../../data/server/creation/creation.functions", () => ({ createRound: vi.fn() }));
vi.mock("../../data/server/preparation/preparation.functions", () => ({
  editRound: vi.fn(),
  deleteRound: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(createRound).mockReset();
  navigate.mockReset();
  vi.mocked(editRound).mockReset();
  vi.mocked(deleteRound).mockReset();
  sessionStorage.clear();
});

const round = roundView(
  makeRound({
    title: "Community grants",
    purpose: "Support local activities.",
    meetingDate: "2027-04-15",
    budget: fromMinorUnits(6000000n),
  }),
);
const populatedRound = roundView(
  makeRound({
    ...round,
    applications: [
      makeApplication({
        requested: fromMinorUnits(7400000n),
        managerRecommendation: {
          position: "Fund",
          allocation: fromMinorUnits(5200000n),
          reasoning: "Support the activities.",
        },
      }),
    ],
  }),
);
const preparation = {
  revision: 0,
  managers: [{ userId: "dana", name: "Dana Reed", email: "dana@example.test" }],
  budgetHistory: [],
};

const PreparationSession = ({
  client,
  repeatActions,
  page = false,
}: {
  page?: boolean;
  client: ReturnType<typeof createQueryClient>;
  repeatActions: boolean;
}) => {
  if (page) {
    return (
      <FundingRoundView
        round={populatedRound}
        preparation={{
          data: workspacePreparationData(client, "alder", "k7m2p9x4n6rt", preparation),
          onDeleted: () =>
            navigate({ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } }),
        }}
        section="applications"
        applicationAction={<button>Add application</button>}
      />
    );
  }

  return <PreparationControls client={client} repeatActions={repeatActions} />;
};

const PreparationControls = ({
  client,
  repeatActions,
}: {
  client: ReturnType<typeof createQueryClient>;
  repeatActions: boolean;
}) => {
  const controller = usePreparationEditing({
    round,
    data: workspacePreparationData(client, "alder", "k7m2p9x4n6rt", preparation),
    onDeleted: () =>
      navigate({ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } }),
  });

  return (
    <>
      <RoundActions
        hasApplications={Boolean(controller.round.applications.length)}
        pending={controller.pending}
        onDelete={() => controller.setDeleting(true)}
        triggerRef={controller.registerMenuTrigger}
      />
      {repeatActions && (
        <RoundActions
          hasApplications={Boolean(controller.round.applications.length)}
          pending={controller.pending}
          onDelete={() => controller.setDeleting(true)}
          triggerRef={controller.registerMenuTrigger}
        />
      )}
      <RoundTitle preparation={controller} />
      {controller.editing === "purpose" ? (
        <RoundEditor preparation={controller} section="purpose" />
      ) : (
        <RoundEditButton preparation={controller} section="purpose" />
      )}
      <RoundEditButton preparation={controller} section="criteria" />
      {controller.editing === "criteria" && (
        <RoundEditor preparation={controller} section="criteria" />
      )}
      <RoundDate preparation={controller} />
      <RoundManager preparation={controller} />
      <RoundBudget preparation={controller} />
      <RoundFeedback preparation={controller} />
      <RoundDeleteConfirmation preparation={controller} />
    </>
  );
};

const renderPreparation = (
  client = createQueryClient(),
  repeatActions = false,
  page = false,
  storageScope?: string,
) =>
  render(
    <QueryClientProvider client={client}>
      <WebMessagesProvider>
        <GrantmakingDrafts storageScope={storageScope}>
          <PreparationSession client={client} repeatActions={repeatActions} page={page} />
        </GrantmakingDrafts>
      </WebMessagesProvider>
    </QueryClientProvider>,
  );

it("only offers Resume for changed drafts and explicitly discards them", async () => {
  renderPreparation();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit purpose" }));

  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Close" }));

  expect(screen.getByRole("button", { name: "Edit purpose" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Edit purpose" }));
  await user.type(screen.getByRole("textbox", { name: "Purpose" }), " New detail.");

  expect(screen.getByRole("button", { name: "Discard changes" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Close" }));
  await user.click(screen.getByRole("button", { name: "Continue editing purpose" }));

  expect(screen.getByRole("textbox", { name: "Purpose" })).toHaveValue(
    `${round.purpose} New detail.`,
  );

  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  await user.click(screen.getByRole("button", { name: "Edit purpose" }));

  expect(screen.getByRole("textbox", { name: "Purpose" })).toHaveValue(round.purpose);
});

it("does not report a successful save when deletion and its refresh fail", async () => {
  const client = createQueryClient();
  const refresh = vi.spyOn(client, "fetchQuery").mockRejectedValue(new Error("Offline"));
  vi.mocked(deleteRound).mockResolvedValue({ status: "conflict" });
  renderPreparation(client);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete round" }));
  await user.click(screen.getByRole("button", { name: "Delete round" }));

  await waitFor(() => expect(refresh).toHaveBeenCalled());

  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(
    screen.getByText("The latest round could not be loaded. Refresh before continuing."),
  ).toBeVisible();
  expect(screen.queryByText(/Your changes were saved/)).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "More actions" })).toHaveFocus());
});

it("renders one delete confirmation even when actions appear in more than one place", async () => {
  renderPreparation(createQueryClient(), true);
  const user = userEvent.setup();
  await user.click(
    screen.getAllByRole("button", { name: "More actions" })[0] ??
      assert.fail('Expected screen.getAllByRole("button", { name: "More actions" })[0]'),
  );
  await user.click(screen.getByRole("menuitem", { name: "Delete round" }));

  expect(screen.getAllByRole("dialog", { name: "Delete this empty round?" })).toHaveLength(1);
});

it("commits a typed date with Enter and sends its exact revision when undoing", async () => {
  vi.mocked(editRound)
    .mockResolvedValueOnce({ status: "ok", revision: 1 })
    .mockResolvedValueOnce({ status: "conflict" });
  renderPreparation();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Edit committee date:/ }));
  const date = screen.getByRole("textbox", { name: "Committee date" });
  fireEvent.change(date, { target: { value: "2027-04-20" } });
  await user.keyboard("{Enter}");

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(
    (
      vi.mocked(editRound).mock.calls[0] ??
      assert.fail("Expected vi.mocked(editRound).mock.calls[0]")
    )[0].data.change,
  ).toMatchObject({
    meetingDate: "2027-04-20",
  });

  await user.click(screen.getByRole("button", { name: "Undo" }));

  await waitFor(() => expect(editRound).toHaveBeenCalledTimes(2));
  expect(
    (
      vi.mocked(editRound).mock.calls[1] ??
      assert.fail("Expected vi.mocked(editRound).mock.calls[1]")
    )[0].data,
  ).toMatchObject({
    expectedRevision: 1,
    change: { meetingDate: round.meetingDate },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("changed");
});

it("keeps a failed calendar choice in the date field for retry", async () => {
  vi.mocked(editRound)
    .mockResolvedValueOnce({ status: "unavailable" })
    .mockResolvedValueOnce({ status: "ok", revision: 1 });
  renderPreparation();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Edit committee date:/ }));
  await user.click(screen.getByRole("button", { name: "Friday, 16 April 2027" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t save this round");
  expect(screen.getByRole("textbox", { name: "Committee date" })).toHaveValue("2027-04-16");

  await user.click(screen.getByRole("button", { name: "Save date" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(editRound).toHaveBeenCalledTimes(2);
  expect(vi.mocked(editRound).mock.calls.at(-1)?.[0].data).toMatchObject({
    expectedRevision: 0,
    change: { meetingDate: "2027-04-16" },
  });
});

it("cancels a typed date through its single dismissal control and restores focus", async () => {
  renderPreparation();
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: /^Edit committee date:/ });
  await user.click(trigger);
  const dialog = within(screen.getByRole("dialog", { name: "Edit committee date" }));
  await user.clear(dialog.getByRole("textbox", { name: "Committee date" }));
  await user.type(dialog.getByRole("textbox", { name: "Committee date" }), "2027-05-20");

  expect(dialog.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  await user.click(dialog.getByRole("button", { name: "Cancel" }));

  await waitFor(() => expect(trigger).toHaveFocus());
  expect(editRound).not.toHaveBeenCalled();
  await user.click(trigger);
  expect(screen.getByRole("textbox", { name: "Committee date" })).toHaveValue(round.meetingDate);
});

it("opens a searchable person picker and keeps failures visible", async () => {
  vi.mocked(editRound).mockResolvedValue({ status: "unavailable" });
  renderPreparation();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Assign manager:/ }));
  const dialog = within(screen.getByRole("dialog", { name: "Assign manager" }));
  await user.click(dialog.getByRole("option", { name: /Dana Reed/ }));

  expect(await dialog.findByRole("alert")).toHaveTextContent("We couldn’t save this round");
  expect(dialog.getByRole("textbox", { name: "Search people" })).toBeVisible();

  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: /^Assign manager:/ }));

  expect(screen.getByRole("option", { name: /Dana Reed/ })).toBeVisible();
});

it("keeps the picker open and blocks dismissal while saving", async () => {
  let finish!: (value: { status: "unavailable" }) => void;
  vi.mocked(editRound).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  renderPreparation();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Assign manager:/ }));
  await user.click(screen.getByRole("option", { name: /Dana Reed/ }));
  await user.keyboard("{Escape}");

  expect(screen.getByRole("dialog", { name: "Assign manager" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

  finish({ status: "unavailable" });

  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t save this round");
});

it("keeps round editing available while the add action follows Applications", async () => {
  const user = userEvent.setup();
  renderPreparation(createQueryClient(), false, true);

  expect(screen.getByRole("button", { name: "Add application" })).toBeVisible();

  for (const name of [/^Edit committee date:/, /^Edit budget:/, /^Assign manager:/]) {
    expect(screen.getByRole("button", { name })).toBeVisible();
  }

  expect(screen.queryByRole("button", { name: "Edit criteria" })).not.toBeInTheDocument();

  const summary = within(screen.getByRole("region", { name: "Round summary" }));
  for (const amount of ["€74,000", "€52,000", "€8,000"]) {
    expect(summary.getByText(amount)).toBeVisible();
  }

  expect(
    within(screen.getByRole("complementary", { name: "Round properties" })).getByText("€60,000"),
  ).toBeVisible();

  await user.click(screen.getByRole("tab", { name: "Overview" }));

  for (const name of [
    round.title,
    "Edit purpose",
    /^Edit committee date:/,
    /^Edit budget:/,
    /^Assign manager:/,
    "Edit criteria",
  ]) {
    expect(screen.getByRole("button", { name })).toBeVisible();
  }

  expect(screen.queryByRole("button", { name: "Add application" })).not.toBeInTheDocument();
});

it("recovers a purpose draft, saves only that section, and preserves another draft across reload", async () => {
  const scope = "round-recovery";
  const baseline = preparationDraft("purpose", round, 0).baseline;
  await seedDraftStorage(scope, "rounds", {
    "alder/k7m2p9x4n6rt/purpose": {
      ...preparationDraft("purpose", round, 0),
      value: { purpose: "Unfinished purpose" },
    },
    "alder/k7m2p9x4n6rt/budget": {
      ...preparationDraft("budget", round, 0),
      value: { amount: baseline.amount, reason: "An unfinished explanation" },
    },
  });
  vi.mocked(editRound).mockResolvedValue({ status: "ok", revision: 1 });
  const client = createQueryClient();
  vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("Offline"));
  const mounted = renderPreparation(client, false, false, scope);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Continue editing purpose" }));

  expect(screen.getByRole("textbox", { name: "Purpose" })).toHaveValue("Unfinished purpose");

  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() =>
    expect(screen.queryByRole("textbox", { name: "Purpose" })).not.toBeInTheDocument(),
  );
  expect(
    (
      vi.mocked(editRound).mock.calls[0] ??
      assert.fail("Expected vi.mocked(editRound).mock.calls[0]")
    )[0].data,
  ).toMatchObject({
    expectedRevision: 0,
    change: {
      section: "details",
      purpose: "Unfinished purpose",
    },
  });
  expect(screen.getByText(/Your changes were saved/)).toBeVisible();
  expect(screen.queryByText(/We couldn’t save this round/)).not.toBeInTheDocument();

  const stored = await readDraftStorage(scope, "rounds");

  expect(stored).not.toHaveProperty("alder/k7m2p9x4n6rt/purpose");
  expect(stored).toMatchObject({
    "alder/k7m2p9x4n6rt/budget": {
      revision: 0,
      value: { reason: "An unfinished explanation" },
    },
  });

  mounted.unmount();
  renderPreparation(client, false, false, scope);
  await user.click(await screen.findByRole("button", { name: /^Resume budget:/ }));

  expect(screen.getByRole("textbox", { name: "Reason for change" })).toHaveValue(
    "An unfinished explanation",
  );
});

it("retains a failed form draft and reports a failed conflict read separately", async () => {
  const client = createQueryClient();
  vi.spyOn(client, "fetchQuery").mockRejectedValue(new Error("Offline"));
  vi.mocked(editRound).mockResolvedValue({ status: "conflict" });
  renderPreparation(client);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit purpose" }));
  await user.type(screen.getByRole("textbox", { name: "Purpose" }), " Keep this work.");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("changed");
  expect(
    screen.getByText("The latest round could not be loaded. Refresh before continuing."),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Purpose" })).toHaveValue(
    `${round.purpose} Keep this work.`,
  );
});

it("removes an earlier quick-edit Undo after a subsequent form save", async () => {
  vi.mocked(editRound)
    .mockResolvedValueOnce({ status: "ok", revision: 1 })
    .mockResolvedValueOnce({ status: "ok", revision: 2 });
  renderPreparation();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Assign manager:/ }));
  await user.click(screen.getByRole("option", { name: /Dana Reed/ }));

  expect(await screen.findByRole("button", { name: "Undo" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Edit purpose" }));
  await user.type(screen.getByRole("textbox", { name: "Purpose" }), " New purpose.");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument(),
  );
});
