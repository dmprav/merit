import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { GrantmakingMessagesProvider } from "../../testing/providers";
import { ReviewerScreen } from "./reviewer-screen";
import {
  reviewerPage,
  reviewerTransport,
  submittedPage,
  type SaveScenario,
} from "./reviewer.story-fixtures.tsx";

Element.prototype.scrollIntoView = vi.fn();

const invitation = () => {
  const page = reviewerPage();
  page.assignment = { ...page.assignment, status: "invited", dueDate: null };
  page.material = null;
  page.criteria = null;
  page.draft = null;
  return page;
};

const renderReviewer = (initial = reviewerPage(), scenario: SaveScenario = "ordinary") => {
  const data = reviewerTransport(initial, scenario);
  render(
    <GrantmakingMessagesProvider>
      <ReviewerScreen initial={initial} data={data} />
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
});

it("offers acceptance without the application until the reviewer joins", () => {
  renderReviewer(invitation());

  expect(screen.getByRole("button", { name: "Accept review" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "Application material" })).not.toBeInTheDocument();
  expect(screen.getByText("No due date")).toBeVisible();
  expect(screen.getByRole("button", { name: "Report a possible conflict" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
});

it("accepts a review and opens the assessment", async () => {
  const { user } = renderReviewer(invitation());

  await user.click(screen.getByRole("button", { name: "Accept review" }));

  expect(await screen.findByRole("textbox", { name: "Overall reasoning" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Accept review" })).not.toBeInTheDocument();
});

it("focuses the first incomplete field when submission is rejected", async () => {
  const { user } = renderReviewer();
  const reasoning = screen.getByRole("textbox", { name: "Overall reasoning" });

  await user.clear(reasoning);
  await user.click(screen.getByRole("button", { name: "Submit assessment" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Complete the highlighted fields to submit.",
  );
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
  const { user } = renderReviewer(reviewerPage(), "conflict");

  await user.type(
    screen.getByRole("textbox", { name: "Overall reasoning" }),
    " Keep my local interpretation.",
  );

  const saved = await screen.findByRole("region", { name: "Saved on the other device" });
  expect(within(saved).getByText(/^Saved on my other device:/)).toBeVisible();
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
  expect(report).toBeDisabled();

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
});
