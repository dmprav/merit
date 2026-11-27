import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { Count } from "./count";

it("shows the number, zero included, as plain text", () => {
  render(<Count>0</Count>);

  expect(screen.getByText("0")).toHaveAttribute("data-tone", "neutral");
});

it("marks a warning count and carries its explanation", () => {
  render(
    <Count tone="warning" title="Two are overdue">
      3
    </Count>,
  );

  expect(screen.getByText("3")).toHaveAttribute("data-tone", "warning");
  expect(screen.getByTitle("Two are overdue")).toHaveTextContent("3");
});
