import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { expect, fireEvent, fn, waitFor, within } from "storybook/test";

import type { SearchedApplication, SearchedRound, WorkspaceSearch } from "@merit/grantmaking/api";
import { createQueryClient } from "@merit/query";
import { ApplicationPage, ApplicationStage } from "@merit/ui/application-shell";
import { Button } from "@merit/ui/button";

import { createWorkspaceSearchData } from "../../data/search/workspace-data";
import { GrantmakingMessagesProvider } from "../../messages";
import { WorkspaceSearchDialog, type SearchLinks } from "./workspace-search";

const round = (
  id: string,
  title: string,
  overrides: Partial<SearchedRound> = {},
): SearchedRound => ({
  id,
  title,
  meetingDate: "2027-06-15",
  matchQuality: "contains",
  ...overrides,
});

const application = (
  id: string,
  title: string,
  overrides: Partial<SearchedApplication> = {},
): SearchedApplication => ({
  id,
  title,
  applicant: "Trust for the Harbour",
  roundId: "k7m2p9x4n6rt",
  roundTitle: "Harbour fund 2027",
  intakeStatus: "ready",
  withdrawn: false,
  matchQuality: "contains",
  ...overrides,
});

const found = (
  rounds: SearchedRound[],
  applications: SearchedApplication[],
  totals: { rounds?: number; applications?: number } = {},
): WorkspaceSearch => ({
  status: "ok",
  rounds: { results: rounds, total: totals.rounds ?? rounds.length },
  applications: { results: applications, total: totals.applications ?? applications.length },
});

const links: SearchLinks = {
  href: (destination) =>
    `#/${destination.kind === "round" ? `rounds/${destination.round.id}` : `applications/${destination.application.id}`}`,
  render: (_destination, { children, href, ...props }) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
};

type Read = (query: string, signal: AbortSignal) => Promise<WorkspaceSearch>;

const Preview = ({ read }: { read: Read }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [client] = useState(() => createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <GrantmakingMessagesProvider>
        <ApplicationStage>
          <ApplicationPage
            width="full"
            locationKey="search"
            breadcrumb={null}
            breadcrumbLabel="Breadcrumb"
          >
            <Button variant="secondary" onPress={() => setIsOpen(true)}>
              Search
            </Button>
            <WorkspaceSearchDialog
              isOpen={isOpen}
              onOpenChange={setIsOpen}
              data={createWorkspaceSearchData({ scope: ["story"], read })}
              links={links}
              commands={[
                {
                  id: "rounds-page",
                  names: ["Funding rounds", "Go to funding rounds"],
                  title: "Go to funding rounds",
                  textValue: "Go to funding rounds",
                  icon: "layers",
                  label: "Page",
                  href: "#/rounds",
                  renderLink: ({ children, ...props }) => <a {...props}>{children}</a>,
                },
                {
                  id: "contacts-page",
                  names: ["Contacts", "Go to contacts"],
                  title: "Go to contacts",
                  textValue: "Go to contacts",
                  icon: "contacts",
                  label: "Page",
                  href: "#/contacts",
                  renderLink: ({ children, ...props }) => <a {...props}>{children}</a>,
                },
                {
                  id: "create",
                  names: ["Create funding round"],
                  title: "Create funding round",
                  textValue: "Create funding round",
                  icon: "add",
                  label: "Action",
                  onAction: () => setIsOpen(false),
                },
              ]}
            />
          </ApplicationPage>
        </ApplicationStage>
      </GrantmakingMessagesProvider>
    </QueryClientProvider>
  );
};

const meta = {
  title: "Features/Workspace/Search",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen", controls: { disable: true } },
  component: Preview,
  args: { read: (async () => found([], [])) as Read },
} satisfies Meta<typeof Preview>;

export default meta;

type Story = StoryObj<typeof meta>;

const box = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Search" });

// user-event answers React Aria's synthetic blur, which moves the highlight while results render,
// by dispatching `change` through act inside React's commit, which React rejects. Typing with
// fireEvent sets the value without user-event's bookkeeping.
const typeText = async (box: HTMLElement, text: string) => {
  await fireEvent(box, new InputEvent("beforeinput", { inputType: "insertText", bubbles: true }));
  await fireEvent.change(box, { target: { value: (box as HTMLInputElement).value + text } });
};

const search = async (canvasElement: HTMLElement, text: string) => {
  const dialog = within(await box(canvasElement));
  await typeText(dialog.getByRole("searchbox"), text);
  return dialog;
};

export const WorkspaceChoices: Story = {
  args: { read: fn(async () => found([], [])) },
  play: async ({ canvasElement, args }) => {
    const dialog = within(await box(canvasElement));

    await waitFor(() =>
      expect(dialog.getByRole("option", { name: /Go to contacts/ })).toBeVisible(),
    );
    await waitFor(() => expect(dialog.getByRole("searchbox")).toHaveFocus());
    await expect(args.read).not.toHaveBeenCalled();
  },
};

export const Results: Story = {
  args: {
    read: async () =>
      found(
        [
          round("k7m2p9x4n6rt", "Harbour fund 2027", { matchQuality: "prefix" }),
          round("h7m2p9x4n6rt", "Spring grants", { meetingDate: null }),
        ],
        [
          application("b8q3w5j7c2df", "Boat repairs"),
          application("c8q3w5j7c2df", "Quayside lights", {
            applicant: null,
            intakeStatus: "in_preparation",
          }),
          application("d8q3w5j7c2df", "Old slipway", {
            intakeStatus: "in_preparation",
            withdrawn: true,
          }),
        ],
      ),
  },
  play: async ({ canvasElement }) => {
    const dialog = await search(canvasElement, "harbour");

    await expect(await dialog.findByRole("option", { name: /^Harbour fund 2027/ })).toBeVisible();
    await waitFor(() =>
      expect(dialog.getByRole("searchbox")).toHaveAttribute(
        "aria-activedescendant",
        dialog.getByRole("option", { name: /^Harbour fund 2027/ }).id,
      ),
    );
    await expect(dialog.getByRole("option", { name: /^Boat repairs/ })).toBeVisible();
    await expect(dialog.getByRole("option", { name: /Quayside lights/ })).toHaveTextContent(
      "In preparation",
    );
    await expect(dialog.getByText("Withdrawn")).toBeVisible();
    await expect(dialog.getByText(/Applicant not known/)).toBeVisible();
    await expect(dialog.getByText("Not scheduled")).toBeVisible();
    await expect(dialog.getByRole("status")).toBeInTheDocument();
  },
};

const many = Array.from({ length: 10 }, (_, index) =>
  application(`b8q3w5j7c2d${index}`, `Harbour project ${index + 1}`),
);

export const MoreMatchesThanShown: Story = {
  args: {
    read: async () =>
      found(
        Array.from({ length: 5 }, (_, index) =>
          round(`k7m2p9x4n6r${index}`, `Harbour round ${index + 1}`),
        ),
        many,
        { rounds: 8, applications: 43 },
      ),
  },
  play: async ({ canvasElement }) => {
    const dialog = await search(canvasElement, "harbour");

    const applications = await dialog.findByText(
      "Showing 10 of 43 applications. Type more to narrow.",
    );
    // The box may still be fading in on narrow screens.
    await waitFor(() => expect(applications).toBeVisible());
    await expect(
      dialog.getByText("Showing 5 of 8 funding rounds. Type more to narrow."),
    ).toBeVisible();
  },
};

export const NoMatches: Story = {
  args: { read: async () => found([], []) },
  play: async ({ canvasElement }) => {
    const dialog = await search(canvasElement, "harbr");

    await expect(await dialog.findByText("No results match “harbr”.")).toBeVisible();
    await expect(dialog.getByRole("searchbox")).toHaveValue("harbr");
  },
};

export const LoadingKeepsResults: Story = {
  args: {
    read: async (query: string) =>
      query === "harbour"
        ? found(
            [round("k7m2p9x4n6rt", "Harbour fund 2027")],
            [application("b8q3w5j7c2df", "Boat repairs")],
          )
        : new Promise<WorkspaceSearch>(() => {}),
  },
  play: async ({ canvasElement }) => {
    const dialog = await search(canvasElement, "harbour");
    await dialog.findByRole("option", { name: /^Boat repairs/ });

    await typeText(dialog.getByRole("searchbox"), " trust");

    await waitFor(() =>
      expect(dialog.getByRole("listbox").closest("[aria-busy]")).toHaveAttribute(
        "aria-busy",
        "true",
      ),
    );
    await expect(dialog.getByRole("option", { name: /^Boat repairs/ })).toBeVisible();
  },
};

const failOnceSearch = (): Read => {
  let failed = false;
  return async () => {
    if (!failed) {
      failed = true;
      throw new Error("Search is down");
    }
    return found([round("k7m2p9x4n6rt", "Harbour fund 2027")], [application("a1", "Boat repairs")]);
  };
};

export const Failure: Story = {
  args: {
    read: failOnceSearch(),
  },
  play: async ({ canvasElement }) => {
    const dialog = await search(canvasElement, "harbour");

    await expect(await dialog.findByText("Search isn’t available right now.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(dialog.getByRole("searchbox")).toHaveValue("harbour");
  },
};
