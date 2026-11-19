import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import type { ContactApplication } from "@merit/contacts-web/contracts";
import { ApplicationPage } from "@merit/ui/application-shell";

import { StoryEnvironment } from "../../../tests/storybook";
import { ContactsDirectory } from "./contacts";
import { configureContacts, contactApplicationsSource } from "./contacts.story-fixtures";

const leah = {
  id: "60000000-0000-4000-8000-000000000001",
  name: "Leah Martin",
  email: "leah@example.test",
  affiliation: "Neighbourhood Kitchen",
  archived: false,
  revision: 0,
  applicationTitles: ["Neighbour Table"],
  applicationsSource: contactApplicationsSource("leah", [
    {
      publicId: "k7m2p9x4n6rt",
      title: "Neighbour Table",
      roundTitle: "Community grants 2026",
      relationships: ["applicant_contact"],
    },
  ]),
};

const meta = {
  title: "Features/Contacts/Directory",
  tags: ["!autodocs"],
  component: ContactsDirectory,
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: {
    workspaceSlug: "alder",
    contacts: [
      leah,
      {
        id: "60000000-0000-4000-8000-000000000002",
        name: "Alexandria Montgomery-Worthington",
        email: "alexandria@example.test",
        affiliation: "Community partnerships",
        archived: false,
        revision: 0,
      },
      {
        id: "60000000-0000-4000-8000-000000000003",
        name: "",
        email: "office@example.test",
        affiliation: "",
        archived: false,
        revision: 0,
      },
    ],
  },
  decorators: [
    (Story) => (
      <StoryEnvironment>
        <ApplicationPage
          width="full"
          locationKey="contacts"
          breadcrumb={null}
          breadcrumbLabel="Breadcrumb"
        >
          <Story />
        </ApplicationPage>
      </StoryEnvironment>
    ),
  ],
  beforeEach: ({ args }) => configureContacts(args.contacts),
} satisfies Meta<typeof ContactsDirectory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const History: Story = {
  args: {
    contacts: [
      {
        ...leah,
        email: "",
        revision: 1,
        history: [
          {
            contactId: leah.id,
            revision: 1,
            actor: "Dana Reed",
            provenance: { interface: "mcp", clientId: "example-client" },
            recordedAt: "2026-11-09T10:00:00Z",
            before: leah,
            after: { ...leah, email: "" },
          },
        ],
      },
    ],
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Actions for Leah Martin" });
    await userEvent.click(trigger);
    await userEvent.click(body.getByRole("menuitem", { name: "Contact history" }));
    const dialog = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Contact history" }),
    );
    await waitFor(() => expect(dialog.getByText("Recorded by Dana Reed")).toBeVisible());
    await expect(dialog.getByText("via MCP client example-client")).toBeVisible();
    await expect(dialog.getByText("leah@example.test")).toBeVisible();
    await expect(dialog.getByText("Removed")).toBeVisible();
    await expect(dialog.getByText("Name")).not.toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(body.getByRole("menuitem", { name: "Contact history" }));
  },
};

export const Empty: Story = {
  args: { contacts: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No contacts yet.")).toBeVisible();
  },
};

export const EmptyActive: Story = {
  args: { contacts: [{ ...leah, archived: true }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No active contacts.")).toBeVisible();
  },
};

export const LongHistory: Story = {
  args: {
    contacts: [
      {
        ...leah,
        history: Array.from({ length: 8 }, (_, index) => ({
          contactId: leah.id,
          revision: index + 1,
          actor: "Dana Reed",
          provenance: { interface: "web" },
          recordedAt: "2026-11-09T10:00:00Z",
          before: index === 0 ? null : leah,
          after: { ...leah, affiliation: `Community programme ${index + 1}` },
        })),
      },
    ],
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Leah Martin" }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", { name: "Contact history" }),
    );
  },
};

export const EmptyArchived: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    await userEvent.click(body.getByRole("button", { name: /Status/ }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", { name: "Archived" }),
    );
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByText("No archived contacts.")).toBeVisible();
  },
};

export const NoSearchResults: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(body.getByRole("searchbox", { name: "Find a contact" }), "Morgan");
    await expect(body.getByRole("button", { name: "Clear search" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByText("No contacts match your search.")).toBeVisible();
  },
};

const applicationTitles = [
  "Neighbour Table",
  "Saturday repair café",
  "School holiday kitchens",
  "Accessible garden paths",
  "Riverside youth studio",
  "Warm homes advice",
  "Library of useful things",
  "Neighbourhood cycling lessons",
  "Shared allotment tools",
  "Evening community transport",
  "Family reading circles",
  "New arrivals welcome kitchen",
  "Community orchard care",
  "Weekend nature club",
  "Youth music mentoring",
  "Market surplus pantry",
  "Accessible sports afternoons",
  "Volunteer kitchen training",
  "Neighbourhood oral histories",
  "Community sewing room",
  "Small business language support",
  "School uniform exchange",
  "Garden to kitchen workshops",
  "After-school makers",
  "Older neighbours walking group",
  "Community hall energy improvements",
  "Local food growing network",
  "Creative carers club",
  "Inclusive playground sessions",
  "Shared spaces for neighbourhood meals and intergenerational partnerships",
];
const manyApplications: ContactApplication[] = applicationTitles.map((title, index) => ({
  publicId: `k7m2p9x4n6${String(index).padStart(2, "0")}`,
  title,
  roundTitle: ["Community grants 2026", "Neighbourhood partnerships 2025", "Stronger communities"][
    index % 3
  ]!,
  relationships:
    index % 3 === 0
      ? ["applicant_contact"]
      : index % 3 === 1
        ? ["review_requested"]
        : ["assessment_recorded"],
}));

export const ManyApplications: Story = {
  args: {
    contacts: [
      {
        ...leah,
        applicationTitles: manyApplications.map((application) => application.title),
        applicationsSource: contactApplicationsSource("many", manyApplications),
      },
    ],
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "30 applications" }));
    const dialog = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Related applications: Leah Martin",
      }),
    );
    await waitFor(() => expect(dialog.getAllByRole("link")).toHaveLength(20));
    await expect(dialog.getAllByRole("link")[0]).toHaveAttribute(
      "href",
      "/app/alder/applications/k7m2p9x4n600",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Load more applications" }));
    await waitFor(() => expect(dialog.getAllByRole("link")).toHaveLength(30));
    await userEvent.click(dialog.getByRole("button", { name: "Close dialog" }));
    const trigger = canvas.getByRole("button", { name: "30 applications" });
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
  },
};

export const MultipleRelationships: Story = {
  args: {
    contacts: [
      {
        ...leah,
        applicationsSource: contactApplicationsSource("multiple-relationships", [
          {
            publicId: "k7m2p9x4n6rt",
            title: "Neighbour Table",
            roundTitle: "Community grants 2026",
            relationships: ["applicant_contact", "review_requested", "assessment_recorded"],
          },
        ]),
      },
    ],
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "1 application" }));
    const dialog = within(
      within(canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Related applications: Leah Martin",
      }),
    );
    await waitFor(() => expect(dialog.getAllByRole("link")).toHaveLength(1));
    await expect(dialog.getByRole("link")).toHaveAccessibleName(
      "Neighbour Table Community grants 2026 Contact for the applicant · Asked to review · Provided an assessment",
    );
  },
};
