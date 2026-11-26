import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { createQueryClient } from "@merit/query";
import { reviewRevisionSchema } from "@merit/reviews/domain";

import { renderWithRouter } from "../../../tests/render-with-router";
import { WebMessagesProvider } from "../../app/messages";
import { applicationOptions, roundsOptions } from "../grantmaking/data/queries";
import { teamOptions } from "../team/data/queries";
import { workspaceOptions } from "../workspace/data/queries";
import { ContactsDirectory as BaseContactsDirectory } from "./contacts";
import { WorkspaceContacts } from "./contacts-provider";
import { contactsOptions } from "./data/queries";
import {
  readContacts,
  saveContact,
  readContactApplications,
} from "./data/server/contacts.functions";

const ContactsDirectory = (props: ComponentProps<typeof BaseContactsDirectory>) => (
  <WorkspaceContacts>
    <BaseContactsDirectory {...props} />
  </WorkspaceContacts>
);

vi.mock("./data/server/contacts.functions", () => ({
  readContacts: vi.fn(),
  saveContact: vi.fn(),
  readContactApplications: vi.fn(),
}));
vi.mock("../grantmaking/data/server/funding-round.functions", () => ({}));
vi.mock("../team/data/server/team.functions", () => ({}));
vi.mock("../workspace/data/server/workspace.functions", () => ({}));

beforeEach(() => {
  vi.mocked(readContacts).mockReset();
  vi.mocked(saveContact).mockReset();
  vi.mocked(readContactApplications).mockReset();
});

it("sends archiving through the contacts server function and routes blocking review work to the application's reviews", async () => {
  const contact = {
    id: "sam",
    name: "Sam Morgan",
    email: "sam@example.test",
    affiliation: "",
    archived: false,
    revision: 0,
    applicationTitles: ["Workshop Saturdays"],
  };
  const client = createQueryClient();
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder",
    contacts: [contact],
  });
  vi.mocked(saveContact).mockResolvedValueOnce({
    status: "invalid",
    error: "outstanding_requests",
    outstanding: [{ publicId: "workshop", title: "Workshop Saturdays" }],
  });
  const { user } = await renderWithRouter(
    <QueryClientProvider client={client}>
      <ContactsDirectory workspaceSlug="alder" contacts={[contact]} />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Actions for Sam Morgan" }));
  await user.click(screen.getByRole("menuitem", { name: "Archive" }));

  expect(
    await screen.findByText(
      "Resolve these outstanding review requests before archiving this contact:",
    ),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Workshop Saturdays" })).toHaveAttribute(
    "href",
    "/app/alder/applications/workshop?tab=reviews",
  );
  expect(saveContact).toHaveBeenCalledExactlyOnceWith({
    data: {
      workspaceSlug: "alder",
      contactId: "sam",
      action: "archive",
      expectedContactRevision: 0,
    },
  });
  client.clear();
});

it("invalidates linked grant records after a contact save without refreshing workspace access or team", async () => {
  const client = createQueryClient();
  const contact = {
    id: "sam-workshop",
    name: "Sam Morgan",
    email: "sam@example.test",
    affiliation: "Community group",
    applicationTitles: ["Workshop Saturdays"],
    archived: false,
    revision: 0,
  };
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder Foundation",
    contacts: [contact],
  });
  const affected = [
    applicationOptions("alder", "b8q3w5j7c2df").queryKey,
    roundsOptions("alder").queryKey,
  ];
  const unaffected = [
    workspaceOptions("alder").queryKey,
    teamOptions("alder").queryKey,
    applicationOptions("birch", "b8q3w5j7c2df").queryKey,
  ];
  for (const key of [...affected, ...unaffected]) {
    client.setQueryData(key, { status: "not_found" });
  }

  const saved = { ...contact, organizationId: "alder", name: "Sam Taylor", revision: 1 };
  vi.mocked(saveContact).mockImplementation(async () => {
    vi.mocked(readContacts).mockResolvedValue({
      status: "ok",
      workspaceName: "Alder Foundation",
      contacts: [saved],
    });
    return { status: "ok", contact: saved };
  });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={client}>
      <WebMessagesProvider>
        <ContactsDirectory workspaceSlug="alder" contacts={[contact]} />
      </WebMessagesProvider>
    </QueryClientProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Actions for Sam Morgan" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit contact details" }));
  const dialog = within(screen.getByRole("dialog", { name: "Edit contact details" }));
  await user.clear(dialog.getByRole("textbox", { name: "Name" }));
  await user.type(dialog.getByRole("textbox", { name: "Name" }), "Sam Taylor");
  await user.click(dialog.getByRole("button", { name: "Save contact" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(client.getQueryData(contactsOptions("alder").queryKey)).toMatchObject({
    contacts: [saved],
  });

  for (const key of affected) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }

  for (const key of unaffected) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  }

  view.unmount();
  client.clear();
});

it("connects the contact count to an authenticated paged source and native overview links", async () => {
  const contact = {
    id: "60000000-0000-4000-8000-000000000001",
    name: "Leah",
    email: "",
    affiliation: "",
    archived: false,
    revision: 0,
    applicationTitles: ["Neighbour Table"],
  };
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder",
    contacts: [contact],
  });
  vi.mocked(readContactApplications).mockResolvedValue({
    status: "ok",
    applications: [
      {
        applicationId: "k7m2p9x4n6rt",
        roundId: "m7m2p9x4n6rt",
        title: "Neighbour Table",
        roundTitle: "Community grants 2026",
        relationships: ["applicant_contact", "assessment_recorded"],
        applicationVersion: materialVersionSchema.parse(1),
        intakeRevision: 0,
        reviewRevision: reviewRevisionSchema.parse(0),
        recommendationRevision: 0,
        decisionRevision: 0,
        intakeStatus: "in_preparation",
        withdrawn: false,
        requested: null,
        contactId: contact.id,
        hasWorkingRevision: false,
      },
    ],
    nextCursor: null,
  });
  const client = createQueryClient();
  const { user } = await renderWithRouter(
    <QueryClientProvider client={client}>
      <ContactsDirectory workspaceSlug="alder" contacts={[]} />
    </QueryClientProvider>,
  );
  const trigger = await screen.findByRole("button", { name: "1 application" });
  expect(readContactApplications).not.toHaveBeenCalled();
  await user.click(trigger);
  expect(
    await screen.findByRole("link", {
      name: "Neighbour Table Contact for the applicant, Provided an assessment in Community grants 2026",
    }),
  ).toHaveAttribute("href", "/app/alder/applications/k7m2p9x4n6rt");
  expect(readContactApplications).toHaveBeenCalledWith({
    data: { workspaceSlug: "alder", contactId: contact.id, after: undefined },
    signal: expect.any(AbortSignal) as unknown,
  });
  client.clear();
});
