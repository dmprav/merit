import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";

import { DraftContext, type ReviewDraft } from "../../controllers/reviews/drafts";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { ReviewWork } from "./review-work";

vi.mock("@merit/contacts-web/contacts", () => ({ ContactPicker: () => null }));

const application = makeApplication();
const round = makeRound();
const recovered: ReviewDraft = {
  mode: "record",
  id: "original-review",
  replacesId: null,
  revision: application.reviews.revision,
  applicationVersion: application.version,
  criteriaVersion: round.criteriaVersion,
  values: {
    contactId: "reviewer",
    applicationVersion: "",
    criteriaVersion: "",
    date: "",
    position: "",
    amount: "12,",
    reasoning: "Recovered assessment",
    observations: [],
    note: "",
  },
};

const setup = () => {
  const client = createQueryClient();
  const setReviewEdit = vi.fn();

  const tree = (ready: boolean, draft?: ReviewDraft) => (
    <QueryClientProvider client={client}>
      <GrantmakingMessagesProvider>
        <DraftContext value={{ ready, reviewEdits: { application: draft }, setReviewEdit }}>
          <ReviewWork
            application={application}
            round={round}
            data={{
              draftKey: "application",
              workspaceSlug: "alder",
              save: vi.fn(),
              refresh: vi.fn(),
            }}
          />
        </DraftContext>
      </GrantmakingMessagesProvider>
    </QueryClientProvider>
  );

  const view = render(tree(false));
  return {
    user: userEvent.setup(),
    setReviewEdit,
    finish: (draft?: ReviewDraft) => view.rerender(tree(true, draft)),
  };
};

it("opens the review dialog while recovering and retains the recovered assessment and baseline", async () => {
  const { user, setReviewEdit, finish } = setup();
  await user.click(screen.getByRole("button", { name: "Record assessment" }));
  expect(screen.getByRole("dialog", { name: "Record assessment" })).toBeVisible();
  expect(screen.getByText("Preparing editor…")).toBeVisible();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(setReviewEdit).not.toHaveBeenCalled();
  finish(recovered);
  expect(screen.getByRole("textbox", { name: "Assessment text" })).toHaveValue(
    recovered.values.reasoning,
  );
  expect(setReviewEdit).not.toHaveBeenCalled();
});

it("closing review recovery leaves restored writing available without opening or changing it", async () => {
  const { user, setReviewEdit, finish } = setup();
  await user.click(screen.getByRole("button", { name: "Record assessment" }));
  await user.click(screen.getByRole("button", { name: "Close" }));
  finish(recovered);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(setReviewEdit).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Resume editing" })).toBeVisible();
});
