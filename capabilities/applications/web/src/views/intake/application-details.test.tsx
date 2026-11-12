import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it } from "vite-plus/test";

import { applicationView } from "@merit/grantmaking/api";
import { makeApplication } from "@merit/grantmaking/testing/fixtures";
import { fromMinorUnits } from "@merit/money";

import { GrantmakingMessagesProvider } from "../../testing/providers";
import { ApplicationDetails } from "./application-details";

type Props = ComponentProps<typeof ApplicationDetails>;

const application = applicationView(
  makeApplication({
    requested: fromMinorUnits(2200000n),
    submission: {
      version: 1,
      organization: "Repair Collective",
      contact: "Sam Morgan",
      contactEmail: "sam@example.test",
      projectPeriod: "March–August 2027",
      submittedOn: "2027-01-20",
      answers: [],
    },
  }),
);
const emptyFields = { applicant: null, contact: null, requested: null, projectPeriod: null };

const renderDetails = (props: Partial<Props> = {}) =>
  render(<ApplicationDetails application={application} {...props} />, {
    wrapper: GrantmakingMessagesProvider,
  });

const terms = () => screen.getAllByRole("term").map((node) => node.textContent);

const definition = (label: string) =>
  within(screen.getByText(label, { selector: "dt" }).parentElement!).getByRole("definition");

it("keeps recorded applicant, contact, amount, and dates in definition-list order", () => {
  renderDetails();

  expect(terms()).toEqual([
    "Applicant",
    "Applicant contact",
    "Contact email",
    "Requested amount",
    "Project dates",
    "Submitted",
  ]);
  expect(definition("Applicant")).toHaveTextContent("Repair Collective");
  expect(within(definition("Applicant contact")).getByText("Sam Morgan")).toBeVisible();
  expect(definition("Contact email")).toHaveTextContent("sam@example.test");
  expect(definition("Requested amount")).toHaveTextContent("€22,000");
  expect(definition("Project dates")).toHaveTextContent("March–August 2027");
  expect(definition("Submitted")).toHaveTextContent("20 January 2027");
  expect(screen.getByText("Applicant", { selector: "dt" }).closest("dl")).not.toHaveAttribute(
    "data-editing",
  );
});

it.each([
  {
    name: "unknown amount without a submission",
    submission: undefined,
    requested: null,
    value: "—",
  },
  {
    name: "zero amount with empty applicant details",
    submission: { version: 1, answers: [] },
    requested: fromMinorUnits(0n),
    value: "€0",
  },
])("omits absent facts for $name", ({ submission, requested, value }) => {
  renderDetails({ application: { ...application, submission, requested } });

  expect(terms()).toEqual(["Requested amount"]);
  expect(definition("Requested amount")).toHaveTextContent(value);
});

it("replaces editable values and hides contact email while keeping the submitted date read-only", () => {
  renderDetails({
    contact: <button>Change recorded contact</button>,
    fields: {
      applicant: <input aria-label="Applicant" defaultValue="Updated applicant" />,
      contact: <button>Select contact</button>,
      requested: <input aria-label="Requested amount" defaultValue="25000" />,
      projectPeriod: <input aria-label="Project dates" defaultValue="Autumn 2027" />,
    },
  });

  expect(terms()).toEqual([
    "Applicant",
    "Applicant contact",
    "Requested amount",
    "Project dates",
    "Submitted",
  ]);
  expect(screen.getByRole("textbox", { name: "Applicant" })).toHaveValue("Updated applicant");
  expect(
    within(definition("Applicant contact")).getByRole("button", { name: "Select contact" }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Change recorded contact" })).not.toBeInTheDocument();
  expect(screen.queryByText("Sam Morgan")).not.toBeInTheDocument();
  expect(screen.queryByText("sam@example.test")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Requested amount" })).toHaveValue("25000");
  expect(screen.getByRole("textbox", { name: "Project dates" })).toHaveValue("Autumn 2027");
  expect(definition("Submitted")).toHaveTextContent("20 January 2027");
  expect(within(definition("Submitted")).queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Applicant" }).closest("dl")).toHaveAttribute(
    "data-editing",
    "true",
  );
});

it.each([undefined, emptyFields])(
  "prefers a standalone contact control when no field is supplied: %s",
  (fields) => {
    renderDetails({ fields, contact: <button>Change contact</button> });

    expect(
      within(definition("Applicant contact")).getByRole("button", { name: "Change contact" }),
    ).toBeVisible();
    expect(screen.queryByText("Sam Morgan")).not.toBeInTheDocument();
  },
);

it("falls back to recorded values for null fields", () => {
  renderDetails({ fields: emptyFields });

  expect(definition("Applicant")).toHaveTextContent("Repair Collective");
  expect(within(definition("Applicant contact")).getByText("Sam Morgan")).toBeVisible();
  expect(definition("Requested amount")).toHaveTextContent("€22,000");
  expect(definition("Project dates")).toHaveTextContent("March–August 2027");
});

it("shows the no-contact fallback and editable rows when recorded material is absent", () => {
  renderDetails({ application: { ...application, submission: undefined }, fields: emptyFields });

  expect(terms()).toEqual(["Applicant", "Applicant contact", "Requested amount", "Project dates"]);
  expect(definition("Applicant contact")).toHaveTextContent("No contact");
  expect(definition("Applicant")).toBeEmptyDOMElement();
  expect(definition("Project dates")).toBeEmptyDOMElement();
});

it("preserves intentionally empty field values instead of displaying recorded values", () => {
  renderDetails({
    contact: <button>Change contact</button>,
    fields: { applicant: "", contact: "", requested: "", projectPeriod: "" },
  });

  for (const label of ["Applicant", "Applicant contact", "Requested amount", "Project dates"]) {
    expect(definition(label)).toBeEmptyDOMElement();
  }
});
