import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";

import { Messages } from "../../messages";
import { ReviewSummary } from "./review-summary";

it("links progress directly to reviews and retains every exceptional reason in one status hint", async () => {
  const user = userEvent.setup();
  render(
    <ReviewSummary
      applicationTitle="Community meals"
      reviews={{ current: 2, outdated: 1, outstanding: 3, unknown: 1 }}
      criteriaChanged
      renderReviewLink={(label) => <a href="/applications/meals?tab=reviews">{label}</a>}
    />,
    { wrapper: Messages },
  );
  expect(screen.getByRole("link", { name: /4 of 7 reviewed/ })).toHaveAttribute(
    "href",
    "/applications/meals?tab=reviews",
  );
  expect(screen.getByRole("link")).toHaveAccessibleName(
    "4 of 7 reviewed. 1 review basis unknown, 2 current reviews, 1 outdated review, 3 awaiting review",
  );
  expect(screen.queryByText("Criteria changed")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  const trigger = screen.getByRole("button", { name: "Review details for Community meals" });
  trigger.focus();
  await user.keyboard("{Enter}");
  const dialog = within(screen.getByRole("dialog", { name: "Review details for Community meals" }));
  expect(
    dialog.getByText(
      /1 review basis unknown, 2 current reviews, 1 outdated review, 3 awaiting review/,
    ),
  ).toHaveTextContent(
    "The current criteria differ from the criteria used for at least one review or request.",
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
});

it.each([
  [{ current: 2, outdated: 0, outstanding: 1, unknown: 0 }, "2 of 3 reviewed"],
  [{ current: 2, outdated: 0, outstanding: 0, unknown: 0 }, "2 of 2 reviewed"],
  [{ current: 0, outdated: 0, outstanding: 2, unknown: 0 }, "0 of 2 reviewed"],
  [{ current: 0, outdated: 0, outstanding: 0, unknown: 0 }, "None assigned"],
])("shows ordinary progress without an icon or dialog: %j", (reviews, label) => {
  render(<ReviewSummary reviews={reviews} />, { wrapper: Messages });
  expect(screen.getByText(label)).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it.each([
  [{ current: 0, outdated: 1, outstanding: 0, unknown: 0 }, false, "1 outdated review"],
  [{ current: 0, outdated: 0, outstanding: 0, unknown: 1 }, false, "1 review basis unknown"],
  [{ current: 1, outdated: 0, outstanding: 0, unknown: 0 }, true, "The current criteria differ"],
])(
  "keeps each exceptional reason inspectable: %j",
  async (reviews, criteriaChanged, explanation) => {
    const user = userEvent.setup();
    render(<ReviewSummary reviews={reviews} criteriaChanged={criteriaChanged} />, {
      wrapper: Messages,
    });
    expect(screen.getByText("1 of 1 reviewed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Review details for this round" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(explanation);
  },
);
