import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { ReferencePane, ReferenceWorkspace } from "@merit/ui/reference-workspace";
import { Toasts } from "@merit/ui/toast";

import type { ManagerReviewerData } from "../../contracts/reviewer";
import { useManagerReviewers } from "../../controllers/reviewer/use-manager-reviewers";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { ManagerReviewers } from "./manager-reviewers";
import { managerReviews, managerTransport, reviewerPage } from "./reviewer.story-fixtures";

const ConnectedManager = ({ data }: { data: ManagerReviewerData }) => {
  const reviews = managerReviews();
  const work = useManagerReviewers(data, reviews.revision)!;
  return <ManagerReviewers reviews={reviews} work={work} />;
};

const renderManager = (data = managerTransport({ status: "ok", value: [] })) => {
  const view = render(
    <GrantmakingMessagesProvider>
      <ConnectedManager data={data} />
      <Toasts />
    </GrantmakingMessagesProvider>,
  );
  return { ...view, data, user: userEvent.setup() };
};

afterEach(() => vi.useRealTimers());

/** Waits out the quiet retries a failed refresh makes before it is reported. */
const afterQuietRetries = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });

const savedRefreshFailure = "Saved, but the latest reviewer participation could not be loaded.";

it("sends an invitation without an optional response date or routine membership guidance", async () => {
  const { user, data } = renderManager();
  await user.click(await screen.findByRole("button", { name: "Invite reviewer" }));
  const invitation = within(screen.getByRole("dialog", { name: "Invite reviewer" }));
  expect(invitation.queryByText(/must first join/)).not.toBeInTheDocument();
  await user.click(invitation.getByRole("button", { name: "Invite reviewer" }));
  await waitFor(() =>
    expect(data.invite).toHaveBeenCalledWith(
      managerReviews().requests[0]!.id,
      null,
      expect.any(String),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText("Awaiting acceptance")).toBeVisible();
});

it("keeps an invitation failure open with the actual missing membership prerequisite", async () => {
  const { user } = renderManager(managerTransport({ status: "ok", value: [] }, "membership"));
  await user.click(await screen.findByRole("button", { name: "Invite reviewer" }));
  const invitation = within(screen.getByRole("dialog", { name: "Invite reviewer" }));
  await user.click(invitation.getByRole("button", { name: "Invite reviewer" }));
  expect(await invitation.findByRole("alert")).toHaveTextContent("must first join the workspace");
  expect(invitation.getByRole("button", { name: "Invite reviewer" })).toBeEnabled();
});

it.each([
  ["contact_unavailable", "This contact is archived"],
  ["contact_email_required", "Add an email address to this contact"],
  ["manager_email_required", "Your workspace membership has no email address"],
  ["request_unavailable", "The assignment changed"],
  ["application_withdrawn", "This application was withdrawn"],
  ["invalid_input", "could not be made as entered"],
] as const)("explains a %s invitation rejection with its recovery", async (error, message) => {
  const data = managerTransport({ status: "ok", value: [] });
  vi.mocked(data.invite).mockResolvedValueOnce({ status: "invalid", error });
  const { user } = renderManager(data);
  await user.click(await screen.findByRole("button", { name: "Invite reviewer" }));
  const invitation = within(screen.getByRole("dialog", { name: "Invite reviewer" }));
  await user.click(invitation.getByRole("button", { name: "Invite reviewer" }));
  expect(await invitation.findByRole("alert")).toHaveTextContent(message);
});

it("asks for a refresh when an assignment action no longer applies", async () => {
  const assignment = { ...reviewerPage().assignment, status: "invited" as const };
  const data = managerTransport({ status: "ok", value: [assignment] });
  vi.mocked(data.manage).mockResolvedValueOnce({ status: "invalid", error: "action_unavailable" });
  const { user } = renderManager(data);
  await user.click(await screen.findByRole("button", { name: "More actions for Sam Morgan" }));
  await user.click(await screen.findByRole("menuitem", { name: "Resend invitation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The assignment changed");
});

it("separates invitation delivery from participation and opens readable assignment history", async () => {
  const assignment = {
    ...reviewerPage().assignment,
    status: "invited" as const,
    delivery: "failed" as const,
    history: [
      {
        action: "review_assignment.invited",
        actor: "Dana Reed",
        note: "Independent assessment requested.",
        at: "2027-01-15T10:00:00Z",
      },
    ],
  };
  const { user } = renderManager(managerTransport({ status: "ok", value: [assignment] }));
  expect(await screen.findByText("Email sending failed")).toBeVisible();
  expect(screen.getByText("Not accepted")).toBeVisible();
  expect(screen.queryByText("Awaiting acceptance")).not.toBeInTheDocument();
  expect(screen.getByText("Response requested by")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "More actions for Sam Morgan" }));
  await user.click(await screen.findByRole("menuitem", { name: "Assignment history" }));
  expect(
    await screen.findByRole("heading", { name: "Assignment history for Sam Morgan" }),
  ).toHaveFocus();
  expect(screen.getByText("Independent assessment requested.")).toBeVisible();
  expect(screen.getByRole("listitem")).toHaveTextContent("Invited");
  await user.click(screen.getByRole("button", { name: "Back to reviewers" }));
  expect(screen.getByRole("button", { name: "More actions for Sam Morgan" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "More actions for Sam Morgan" }));
  expect(await screen.findByRole("menuitem", { name: "Resend invitation" })).toBeVisible();
});

it("requires and focuses a conflict resolution before restoring participation", async () => {
  const assignment = {
    ...reviewerPage().assignment,
    status: "conflict" as const,
    conflict: "I advised this applicant.",
  };
  const { user, data } = renderManager(managerTransport({ status: "ok", value: [assignment] }));
  await user.click(await screen.findByRole("button", { name: "Clear conflict" }));
  const resolutionDialog = within(screen.getByRole("dialog", { name: "Clear conflict" }));
  expect(resolutionDialog.getByText("I advised this applicant.")).toBeVisible();
  await user.click(resolutionDialog.getByRole("button", { name: "Clear conflict" }));
  const explanation = resolutionDialog.getByRole("textbox", {
    name: "Explain why the review can proceed",
  });
  await waitFor(() => expect(explanation).toHaveFocus());
  expect(data.manage).not.toHaveBeenCalled();
  await user.type(explanation, "The advice concerned an unrelated project.");
  await user.click(resolutionDialog.getByRole("button", { name: "Clear conflict" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText("Awaiting acceptance")).toBeVisible();
});

it("keeps occasional commands in the reviewer menu and confirms ending access", async () => {
  const assignment = { ...reviewerPage().assignment, status: "invited" as const };
  const { user, data } = renderManager(managerTransport({ status: "ok", value: [assignment] }));
  const more = await screen.findByRole("button", { name: "More actions for Sam Morgan" });
  expect(screen.queryByRole("button", { name: "End access" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Resend invitation" })).not.toBeInTheDocument();
  more.focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: "Resend invitation" }));
  await waitFor(() =>
    expect(data.manage).toHaveBeenCalledWith(assignment, "resend", "", expect.any(String)),
  );
  await user.click(more);
  await user.click(await screen.findByRole("menuitem", { name: "End access" }));
  const confirmation = within(screen.getByRole("dialog", { name: "End Sam Morgan’s access?" }));
  expect(
    confirmation.getByText(/private draft and any submitted assessment are preserved/),
  ).toBeVisible();
  await user.click(confirmation.getByRole("button", { name: "End access" }));
  expect(await screen.findByRole("button", { name: "Reinstate assignment" })).toBeVisible();
});

it("restores the reviewer list reading position and history trigger after returning", async () => {
  const data = managerTransport({ status: "ok", value: [reviewerPage().assignment] });
  render(
    <GrantmakingMessagesProvider>
      <ReferenceWorkspace>
        <ReferencePane label="Reviewer list">
          <ConnectedManager data={data} />
        </ReferencePane>
      </ReferenceWorkspace>
    </GrantmakingMessagesProvider>,
  );
  const user = userEvent.setup();
  const viewport = screen.getByRole("group", { name: "Reviewer list" });
  const history = await screen.findByRole("button", { name: "More actions for Sam Morgan" });
  viewport.scrollTop = 360;
  await user.click(history);
  await user.click(await screen.findByRole("menuitem", { name: "Assignment history" }));
  expect(screen.getByRole("heading", { name: "Assignment history for Sam Morgan" })).toHaveFocus();
  viewport.scrollTop = 20;
  await user.click(screen.getByRole("button", { name: "Back to reviewers" }));
  expect(viewport.scrollTop).toBe(360);
  expect(screen.getByRole("button", { name: "More actions for Sam Morgan" })).toHaveFocus();
});

it.each(["assignments", "workspace"] as const)(
  "recovers a committed invitation after the %s refresh fails without inviting again",
  async (failedRead) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const data = managerTransport({ status: "ok", value: [] });
    const readFailure = vi.spyOn(data, "read");
    const refreshFailure = vi.spyOn(data, "refresh");
    const { user } = renderManager(data);
    await user.click(await screen.findByRole("button", { name: "Invite reviewer" }));
    // The first read and both quiet retries fail before the failure is reported.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (failedRead === "assignments") {
        readFailure.mockResolvedValueOnce({ status: "unavailable" });
      } else {
        refreshFailure.mockRejectedValueOnce(new Error("Unavailable"));
      }
    }
    const invitation = within(screen.getByRole("dialog", { name: "Invite reviewer" }));
    await user.click(invitation.getByRole("button", { name: "Invite reviewer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Awaiting acceptance")).toBeVisible();
    await afterQuietRetries();
    const failure = screen.getByRole("alertdialog", { name: savedRefreshFailure });
    await user.click(within(failure).getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: savedRefreshFailure }),
      ).not.toBeInTheDocument(),
    );
    expect(data.invite).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Awaiting acceptance")).toBeVisible();
  },
);

it("retries a failed initial assignment read and clears its read failure", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const data = managerTransport({ status: "ok", value: [] });
  vi.spyOn(data, "read")
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockRejectedValueOnce(new Error("Unavailable"));
  const { user } = renderManager(data);
  await afterQuietRetries();
  const failure = await screen.findByRole("alertdialog", {
    name: "The latest reviewer participation could not be loaded.",
  });
  await user.click(within(failure).getByRole("button", { name: "Refresh" }));
  expect(await screen.findByRole("button", { name: "Invite reviewer" })).toBeEnabled();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(data.invite).not.toHaveBeenCalled();
});

it("retains a saved refresh failure when a workspace update arrives during recovery", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const data = managerTransport({ status: "ok", value: [] });
  let rejectWorkspace!: (error: Error) => void;
  vi.spyOn(data, "refresh").mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectWorkspace = reject;
      }),
  );
  const { user, rerender } = renderManager(data);
  await user.click(await screen.findByRole("button", { name: "Invite reviewer" }));
  await user.click(
    within(screen.getByRole("dialog", { name: "Invite reviewer" })).getByRole("button", {
      name: "Invite reviewer",
    }),
  );
  await waitFor(() => expect(data.refresh).toHaveBeenCalledTimes(1));

  let finishLateRead!: (result: Awaited<ReturnType<ManagerReviewerData["read"]>>) => void;
  const assignments = {
    status: "ok" as const,
    value: [{ ...reviewerPage().assignment, status: "invited" as const }],
  };
  const lateRead = new Promise<Awaited<ReturnType<ManagerReviewerData["read"]>>>((resolve) => {
    finishLateRead = resolve;
  });
  const nextData = {
    ...data,
    read: vi.fn<ManagerReviewerData["read"]>().mockReturnValue(lateRead),
  };
  rerender(
    <GrantmakingMessagesProvider>
      <ConnectedManager data={nextData} />
      <Toasts />
    </GrantmakingMessagesProvider>,
  );
  // The workspace stays unavailable through the quiet retries.
  vi.mocked(data.refresh).mockRejectedValue(new Error("Workspace read failed"));
  await act(async () => rejectWorkspace(new Error("Workspace read failed")));
  await act(async () => finishLateRead(assignments));
  await afterQuietRetries();

  const failure = screen.getByRole("alertdialog", { name: savedRefreshFailure });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  nextData.read.mockResolvedValue(assignments);
  vi.mocked(data.refresh).mockResolvedValue(undefined);
  await user.click(within(failure).getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("alertdialog", { name: savedRefreshFailure }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByText("Awaiting acceptance")).toBeVisible();
  expect(data.invite).toHaveBeenCalledTimes(1);
});
