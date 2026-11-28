import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { Badge } from "./badge";

const svg = (label: string) => screen.getByText(label).querySelector("svg");

it.each([
  ["success", "lucide-circle-check"],
  ["warning", "lucide-triangle-alert"],
  ["danger", "lucide-circle-x"],
] as const)("a plain %s badge shows its tone icon even when given another", (tone, icon) => {
  render(
    <Badge appearance="plain" tone={tone} icon="clock">
      Status
    </Badge>,
  );
  expect(svg("Status")).toHaveClass(icon);
});

it("a plain neutral badge shows the icon it is given, or none", () => {
  const { rerender } = render(
    <Badge appearance="plain" icon="clock">
      Status
    </Badge>,
  );
  expect(svg("Status")).toHaveClass("lucide-clock");
  rerender(<Badge appearance="plain">Status</Badge>);
  expect(svg("Status")).toBeNull();
});

it("a filled badge shows no icon", () => {
  render(
    <Badge tone="danger" icon="clock">
      Status
    </Badge>,
  );
  expect(svg("Status")).toBeNull();
});
