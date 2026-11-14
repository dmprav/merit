import { QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import { renderWithRouter } from "../../../tests/render-with-router";
import { listReviewerAssignments } from "./data/server/reviews/reviewer.functions";
import { workAssignments } from "./my-work.fixtures";
import { MyWorkPage } from "./reviewer-page";

vi.mock("./data/server/reviews/reviewer.functions", () => ({ listReviewerAssignments: vi.fn() }));

it("shows workspace review tasks, status, localized due dates, and scoped links", async () => {
  vi.mocked(listReviewerAssignments).mockResolvedValue({ status: "ok", value: workAssignments });
  await renderWithRouter(
    <QueryClientProvider client={createQueryClient()}>
      <MyWorkPage workspaceSlug="alder" />
    </QueryClientProvider>,
    "/app/alder/work",
  );
  expect(await screen.findByRole("heading", { name: "My work" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Neighbour Table" })).toHaveAttribute(
    "href",
    `/app/alder/work/${workAssignments[0]!.id}`,
  );
  const assignments = screen.getByRole("table", { name: "Review assignments" });
  const invitation = within(assignments).getByRole("row", { name: /Neighbour Table/ });
  expect(within(invitation).getByText("Awaiting acceptance")).toBeVisible();
  expect(within(invitation).getByText("10 February 2027")).toBeVisible();
  const inProgress = within(assignments).getByRole("row", { name: /Workshop Saturdays/ });
  expect(within(inProgress).getByText("In progress")).toBeVisible();
  expect(within(inProgress).getByText("No due date")).toBeVisible();
  expect(within(assignments).getByText("Submitted")).toBeVisible();
  expect(listReviewerAssignments).toHaveBeenCalledWith(
    expect.objectContaining({ data: { workspaceSlug: "alder" } }),
  );
});

it("explains an empty workspace without a nonfunctional action", async () => {
  vi.mocked(listReviewerAssignments).mockResolvedValue({ status: "ok", value: [] });
  await renderWithRouter(
    <QueryClientProvider client={createQueryClient()}>
      <MyWorkPage workspaceSlug="alder" />
    </QueryClientProvider>,
    "/app/alder/work",
  );
  expect(
    await screen.findByText(/When a program manager assigns an application to you/),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("No review assignments yet.");
});
