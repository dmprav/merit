import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { Breadcrumbs } from "./breadcrumbs";

it("identifies the current location and keeps parent links in hierarchy order", () => {
  render(
    <Breadcrumbs
      label="Location"
      items={[
        <a key="rounds" href="/rounds">
          Rounds
        </a>,
        <a key="round" href="/rounds/local?section=applications">
          Local Connections
        </a>,
        "Workshop Saturdays",
      ]}
    />,
  );
  const navigation = screen.getByRole("navigation", { name: "Location" });
  const items = within(navigation).getAllByRole("listitem");

  expect(items).toHaveLength(3);
  expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", "/rounds");
  expect(within(items[1]!).getByRole("link")).toHaveAttribute(
    "href",
    "/rounds/local?section=applications",
  );
  expect(within(items[2]!).getByText("Workshop Saturdays")).toHaveAttribute("aria-current", "page");
  expect(within(items[2]!).queryByRole("link")).not.toBeInTheDocument();

  for (const separator of within(navigation).getAllByText("/")) {
    expect(separator).toHaveAttribute("aria-hidden", "true");
  }
});

it("supports a current-page-only trail and omits an empty navigation landmark", () => {
  const { rerender } = render(<Breadcrumbs label="Location" items={["Organizations"]} />);

  expect(screen.getByText("Organizations")).toHaveAttribute("aria-current", "page");
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.queryByText("/")).not.toBeInTheDocument();

  rerender(<Breadcrumbs label="Location" items={[]} />);

  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
