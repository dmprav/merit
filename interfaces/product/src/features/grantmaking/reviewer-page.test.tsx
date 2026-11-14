import { screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { renderWithRouter } from "../../../tests/render-with-router";
import { ReviewerUnavailable } from "./reviewer-page";

const assignmentId = "00000000-0000-4000-a000-000000000001";

describe("workspace assignment states", () => {
  it("prompts signed-out visitors to sign in with the assignment returnTo", async () => {
    await renderWithRouter(
      <ReviewerUnavailable status="signed_out" />,
      `/app/alder/work/${assignmentId}`,
    );

    const link = screen.getByRole("link", { name: "Sign in" });
    const destination = new URL(link.getAttribute("href")!, "http://localhost");
    expect(destination.pathname).toBe("/app/sign-in");
    expect(destination.searchParams.get("returnTo")).toBe(`/app/alder/work/${assignmentId}`);
  });

  it.each(["not_found", "forbidden"] as const)(
    "does not prompt an authenticated reviewer to sign in when status is %s",
    async (status) => {
      await renderWithRouter(
        <ReviewerUnavailable status={status} />,
        `/app/alder/work/${assignmentId}`,
      );

      expect(screen.getByRole("heading", { name: "Review not available" })).toBeVisible();
      expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    },
  );

  it("offers retry when the review service is unavailable", async () => {
    await renderWithRouter(
      <ReviewerUnavailable status="unavailable" />,
      `/app/alder/work/${assignmentId}`,
    );

    expect(screen.getByRole("heading", { name: "Review could not be loaded" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });
});
