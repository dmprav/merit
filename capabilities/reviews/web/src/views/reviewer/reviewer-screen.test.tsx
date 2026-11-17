import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import type { ReviewerSession } from "../../controllers/reviewer/use-reviewer";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { ReviewerScreen } from "./reviewer-screen";
import {
  reviewerPage,
  reviewerTransport,
  submittedPage,
  type SaveScenario,
} from "./reviewer.story-fixtures.tsx";

const invitation = () => {
  const page = reviewerPage();
  page.assignment = { ...page.assignment, status: "invited", dueDate: null };
  page.material = null;
  page.documents = null;
  page.criteria = null;
  page.draft = null;
  return page;
};

const renderReviewer = (
  initial = reviewerPage(),
  scenario: SaveScenario = "ordinary",
  session?: ReviewerSession,
) => {
  const data = reviewerTransport(initial, scenario);
  render(
    <GrantmakingMessagesProvider>
      <ReviewerScreen initial={initial} data={data} session={session} />
    </GrantmakingMessagesProvider>,
  );
  return { user: userEvent.setup() };
};

const dialog = (name: string) => screen.getByRole("dialog", { name });

it("shows the private draft while a reviewer is writing", () => {
  renderReviewer();

  expect(screen.getByRole("textbox", { name: "Overall reasoning" })).toHaveValue(
    reviewerPage().draft!.content.reasoning,
  );
  expect(
    screen.getByText(
      "Your draft is private. The manager can read your assessment after you submit it.",
    ),
  ).toBeVisible();
  const assessment = within(screen.getByRole("region", { name: "Your assessment" }));
  expect(assessment.getByText("Requested by Dana Reed")).toBeVisible();
  expect(assessment.getByText(/Response requested by/)).toBeVisible();
  expect(screen.queryByRole("link", { name: "Ask a question by email" })).not.toBeInTheDocument();
});

it("offers acceptance without the application until the reviewer accepts", () => {
  renderReviewer(invitation());

  expect(screen.getByRole("heading", { name: "Review invitation" })).toBeVisible();
  expect(screen.getAllByRole("heading")).toHaveLength(1);
  expect(screen.getByText(invitation().assignment.applicationTitle)).toBeVisible();
  expect(screen.getByText(/has invited you to review this application/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Accept review" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "Application material" })).not.toBeInTheDocument();
  expect(screen.getByText("No response date requested")).toBeVisible();
  expect(screen.getByRole("button", { name: "Report a possible conflict" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
});

it("accepts a review and opens the assessment", async () => {
  const { user } = renderReviewer(invitation());

  await user.click(screen.getByRole("button", { name: "Accept review" }));

  expect(await screen.findByRole("textbox", { name: "Overall reasoning" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Accept review" })).not.toBeInTheDocument();
});

it("keeps the invitation response visibly pending until it is confirmed", () => {
  renderReviewer(invitation(), "ordinary", { busy: true });

  expect(screen.getByRole("status")).toHaveTextContent("Saving changes…");
  expect(screen.getByRole("button", { name: "Accept review" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Decline review" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Report a possible conflict" })).toBeDisabled();
});

it("focuses the first incomplete field when submission is rejected", async () => {
  const { user } = renderReviewer();
  const reasoning = screen.getByRole("textbox", { name: "Overall reasoning" });

  await user.clear(reasoning);
  await user.click(screen.getByRole("button", { name: "Submit assessment" }));

  expect(screen.queryByText("Complete the highlighted fields to submit.")).not.toBeInTheDocument();
  await waitFor(() => expect(reasoning).toHaveFocus());
  expect(reasoning).toHaveAccessibleDescription("Give the reasoning for your position.");
});

it("keeps submission unavailable while a draft save is pending", async () => {
  const { user } = renderReviewer(reviewerPage(), "saving");

  await user.type(screen.getByRole("textbox", { name: "Overall reasoning" }), " More evidence.");

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Submit assessment" })).toBeDisabled(),
  );
  expect(screen.getByText("Saving draft…")).toBeVisible();
});

it("retries a failed save without losing the unsaved sentence", async () => {
  const { user } = renderReviewer(reviewerPage(), "unavailable");
  const reasoning = screen.getByRole("textbox", { name: "Overall reasoning" });

  await user.type(reasoning, " Keep this unsaved sentence.");

  expect(await screen.findByRole("alert")).toHaveTextContent("Your text is still here");
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Draft saved", { exact: true })).toBeVisible();
  expect(reasoning).toHaveValue(
    `${reviewerPage().draft!.content.reasoning} Keep this unsaved sentence.`,
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("shows both drafts and holds submission until the reviewer chooses one", async () => {
  const page = reviewerPage();
  page.draft!.content.amount = "123.456";
  const { user } = renderReviewer(page, "conflict");

  await user.type(
    screen.getByRole("textbox", { name: "Overall reasoning" }),
    " Keep my local interpretation.",
  );

  const saved = await screen.findByRole("region", { name: "Saved on the other device" });
  expect(within(saved).getByText(/^Saved on my other device:/)).toBeVisible();
  expect(within(saved).getByText("123.456")).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "Your text on this device" })).getByText("123.456"),
  ).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "Your text on this device" })).getByText(
      /Keep my local interpretation\.$/,
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Submit assessment" })).toBeDisabled();
});

it("switches to the assessment criteria without changing the draft", async () => {
  const { user } = renderReviewer();

  await user.click(
    screen.getByRole("button", { name: "Reference material: Application material" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Assessment criteria" }));

  expect(screen.getByRole("region", { name: "Assessment criteria" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "Application material" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Overall reasoning" })).toHaveValue(
    reviewerPage().draft!.content.reasoning,
  );
});

it("requires an explanation before reporting a conflict", async () => {
  const { user } = renderReviewer();

  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Report a possible conflict" }));
  const report = within(dialog("Report a possible conflict")).getByRole("button", {
    name: "Report conflict",
  });
  await user.click(report);
  const explanation = within(dialog("Report a possible conflict")).getByRole("textbox", {
    name: "Explain the possible conflict",
  });
  await waitFor(() => expect(explanation).toHaveFocus());
  expect(explanation).toHaveAccessibleDescription("Explain the possible conflict.");

  await user.type(
    within(dialog("Report a possible conflict")).getByRole("textbox", {
      name: "Explain the possible conflict",
    }),
    "I recently advised this applicant on another project.",
  );
  await user.click(report);

  expect(await screen.findByText(/This review is paused/)).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("withdraws after confirming the lost access", async () => {
  const { user } = renderReviewer();

  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Withdraw from review" }));
  const confirmation = dialog("Withdraw from this review?");
  expect(confirmation).toHaveTextContent("This ends your access");
  await user.click(within(confirmation).getByRole("button", { name: "Withdraw from review" }));

  expect(await screen.findByText("Declined", { exact: true })).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("resumes an unfinished amendment and can discard it for the submitted assessment", async () => {
  const page = submittedPage();
  page.draft!.content = {
    ...page.draft!.content,
    reasoning: "Unfinished amendment: the venue is confirmed.",
    note: "Venue confirmation arrived.",
  };
  const { user } = renderReviewer(page);

  expect(screen.queryByRole("textbox", { name: "Overall reasoning" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Resume amendment" }));
  const reasoning = screen.getByRole("textbox", { name: "Overall reasoning" });
  expect(reasoning).toHaveValue("Unfinished amendment: the venue is confirmed.");
  await user.type(reasoning, " Updated.");
  expect(await screen.findByText("Draft saved", { exact: true })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Close" }));
  await user.click(screen.getByRole("button", { name: "Resume amendment" }));
  await user.click(screen.getByRole("button", { name: "Discard amendment" }));

  expect(screen.getByRole("button", { name: "Amend assessment" })).toBeVisible();
  expect(await screen.findByText(/^The free venue/)).toBeVisible();
});

it("keeps unsaved writing visible after access ends", async () => {
  const { user } = renderReviewer(reviewerPage(), "revoked");
  const reasoning = screen.getByRole("textbox", { name: "Overall reasoning" });

  await user.type(reasoning, " This writing has not reached the server.");

  expect(await screen.findByRole("alert")).toHaveTextContent("Your access has changed");
  await user.click(screen.getByRole("button", { name: "Refresh" }));

  expect(await screen.findByText("Access ended", { exact: true })).toBeVisible();
  expect(screen.getByText(/This writing has not reached the server\.$/)).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Overall reasoning" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Application material" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Unsaved assessment" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Copy draft" })).toBeVisible();
});

const retainedDraft = () => {
  const initial = reviewerPage();
  initial.assignment.status = "cancelled";
  initial.material = null;
  initial.criteria = null;
  const draft = {
    ...initial.draft!.content,
    amount: "123.456",
    reasoning: "My unsaved reasoning.",
    observations: [{ criterionId: null, criterion: "Access", text: "Keep the criterion note." }],
    note: "Keep the amendment explanation.",
  };
  return { initial, session: { draft, error: "accessLost" } };
};

it("copies all retained draft fields and confirms only after clipboard success", async () => {
  const { initial, session } = retainedDraft();
  const { user } = renderReviewer(initial, "ordinary", session);
  let finish!: () => void;
  const write = vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );

  expect(screen.getByRole("heading", { name: "Access ended" })).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Copy draft" }));
  expect(screen.getByRole("button", { name: "Copying…" })).toBeDisabled();
  expect(screen.queryByText("Draft copied.")).not.toBeInTheDocument();
  expect(write).toHaveBeenCalledWith(expect.stringContaining("Proposed amount\n123.456"));
  expect(write).toHaveBeenCalledWith(expect.stringContaining("My unsaved reasoning."));
  expect(write).toHaveBeenCalledWith(expect.stringContaining("Access\nKeep the criterion note."));
  expect(write).toHaveBeenCalledWith(expect.stringContaining("Keep the amendment explanation."));

  finish();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Draft copied."));
  expect(screen.getByRole("button", { name: "Copy draft" })).toBeEnabled();
});

it("explains a failed clipboard write and leaves the retained draft available", async () => {
  const { initial, session } = retainedDraft();
  const { user } = renderReviewer(initial, "ordinary", session);
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Clipboard denied"));

  await user.click(screen.getByRole("button", { name: "Copy draft" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("The draft could not be copied");
  expect(screen.queryByText("Draft copied.")).not.toBeInTheDocument();
  expect(screen.getByText("My unsaved reasoning.")).toBeVisible();
  expect(screen.getByText("123.456")).toBeVisible();
  expect(screen.getByText("Keep the criterion note.")).toBeVisible();
  expect(screen.getByText("Keep the amendment explanation.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Copy draft" })).toBeEnabled();
});

it("rejects excess money precision when typed or pasted without rounding the draft", async () => {
  const { user } = renderReviewer();
  const amount = screen.getByRole("textbox", { name: "Proposed amount" });

  await user.clear(amount);
  await user.type(amount, "123.456");
  expect(amount).toHaveValue("123.45");
  expect(amount).toHaveAccessibleDescription(/Use numbers with up to two decimal places\./);
  await user.clear(amount);
  await user.paste("99.999");
  expect(amount).toHaveValue("");
  expect(amount).toHaveAccessibleDescription(/Use numbers with up to two decimal places\./);
});

it("keeps invalid restored money visible and blocks submission", async () => {
  const page = reviewerPage();
  page.draft!.content.amount = "123.456";
  const { user } = renderReviewer(page);
  const amount = screen.getByRole("textbox", { name: "Proposed amount" });

  await user.click(screen.getByRole("button", { name: "Submit assessment" }));
  expect(amount).toHaveValue("123.456");
  await waitFor(() => expect(amount).toHaveFocus());
  expect(screen.queryByText("Your assessment has been submitted.")).not.toBeInTheDocument();
});

it("opens source documents beside the assigned material without attach or refer", async () => {
  const { user } = renderReviewer();
  await user.click(screen.getByRole("button", { name: /^Reference material:/ }));
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
    "Application material",
    "Documents",
    "Assessment criteria",
  ]);
  await user.click(screen.getByRole("menuitem", { name: "Documents" }));
  expect(screen.getByRole("heading", { name: "Source documents" })).toBeVisible();
  expect(screen.getByText("No proposal or budget is attached.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Attach proposal" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refer to this page" })).not.toBeInTheDocument();
});

it("preserves a possible conflict explanation when the form is closed and reopened", async () => {
  const { user } = renderReviewer(invitation());
  await user.click(screen.getByRole("button", { name: "Report a possible conflict" }));
  await user.type(
    screen.getByRole("textbox", { name: "Explain the possible conflict" }),
    "I advised the applicant.",
  );
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Report a possible conflict" }));
  expect(screen.getByRole("textbox", { name: "Explain the possible conflict" })).toHaveValue(
    "I advised the applicant.",
  );
});
