import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { ContactsMessagesProvider } from "../messages";
import { ContactDetails } from "./contact-details";

const before = {
  name: "Leah Martin",
  email: "leah@example.test",
  affiliation: "",
  archived: false,
};
const saved = {
  name: "Leah Morgan",
  email: "",
  affiliation: "Neighbourhood Kitchen",
  archived: true,
};
const labels = { name: "Name", email: "Email", affiliation: "Affiliation", archived: "Status" };

it.each(["name", "email", "affiliation", "archived"] as const)(
  "marks only the changed %s field, including removed values and archive state",
  (field) => {
    render(<ContactDetails value={{ ...before, [field]: saved[field] }} comparison={before} />, {
      wrapper: ContactsMessagesProvider,
    });

    for (const label of Object.values(labels)) {
      const term = screen.getByText(label).closest("dt")!;
      expect(within(term).queryByText("Changed") !== null).toBe(label === labels[field]);
    }
    if (field === "email") {
      expect(
        within(screen.getByText("Email").closest("div")!).getByText("Not provided"),
      ).toBeVisible();
    }
  },
);

it("marks restoration as a status change", () => {
  render(<ContactDetails value={before} comparison={{ ...before, archived: true }} />, {
    wrapper: ContactsMessagesProvider,
  });

  expect(within(screen.getByText("Status").closest("dt")!).getByText("Changed")).toBeVisible();
  expect(screen.getByText("Active")).toBeVisible();
});

it.each([undefined, null, before])(
  "leaves unchanged or uncomparable facts unmarked (%j)",
  (comparison) => {
    render(<ContactDetails value={before} comparison={comparison} />, {
      wrapper: ContactsMessagesProvider,
    });

    expect(screen.queryByText("Changed")).not.toBeInTheDocument();
    expect(screen.getByText("leah@example.test")).toBeVisible();
  },
);
