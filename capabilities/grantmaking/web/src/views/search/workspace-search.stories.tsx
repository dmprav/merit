import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { expect, fireEvent, fn, waitFor, within } from "storybook/test";

import type { SearchedApplication, SearchedRound, WorkspaceSearch } from "@merit/grantmaking/api";
import { createQueryClient } from "@merit/query";
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
        <Button variant="secondary" onPress={() => setIsOpen(true)}>
          Search
        </Button>
        <WorkspaceSearchDialog
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          data={createWorkspaceSearchData({ scope: ["story"], read })}
          links={links}
        />
      </GrantmakingMessagesProvider>
    </QueryClientProvider>
  );
};

const meta = {
  title: "Features/Funding rounds/Workspace search",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
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

export const Hint: Story = {
  args: { read: fn(async () => found([], [])) },
  play: async ({ canvasElement, args }) => {
    const dialog = within(await box(canvasElement));

    await waitFor(() =>
      expect(
        dialog.getByText("Search funding rounds and applications by name or applicant."),
      ).toBeVisible(),
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
          application("c8q3w5j7c2df", "Quayside lights", { applicant: "Dock committee" }),
        ],
      ),
  },
  play: async ({ canvasElement }) => {
    const dialog = await search(canvasElement, "harbour");

    await expect(await dialog.findByRole("group", { name: "Funding rounds" })).toBeVisible();
    await waitFor(() =>
      expect(dialog.getByRole("searchbox")).toHaveAttribute(
        "aria-activedescendant",
        dialog.getByRole("option", { name: /^Harbour fund 2027/ }).id,
      ),
    );
    await expect(dialog.getByRole("group", { name: "Applications" })).toBeVisible();
    await expect(dialog.getByText("Not scheduled")).toBeVisible();
    await expect(dialog.getByRole("status")).toBeInTheDocument();
  },
};

export const ApplicationsFirst: Story = {
  args: {
    read: async () =>
      found(
        [round("k7m2p9x4n6rt", "Boat repairs round")],
        [application("b8q3w5j7c2df", "Boat repairs", { matchQuality: "exact" })],
      ),
  },
  play: async ({ canvasElement }) => {
    const dialog = await search(canvasElement, "boat repairs");

    const applications = await dialog.findByRole("group", { name: "Applications" });
    const rounds = dialog.getByRole("group", { name: "Funding rounds" });
    await expect(
      applications.compareDocumentPosition(rounds) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
};

export const StatusLabels: Story = {
  args: {
    read: async () =>
      found(
        [],
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

    await expect(await dialog.findByText("In preparation")).toBeVisible();
    await expect(dialog.getByText("Withdrawn")).toBeVisible();
    await expect(dialog.getByText(/Applicant not known/)).toBeVisible();
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

    await expect(
      await dialog.findByText("No funding rounds or applications match “harbr”."),
    ).toBeVisible();
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

export const Failure: Story = {
  args: {
    read: async () => {
      throw new Error("Search is down");
    },
  },
  play: async ({ canvasElement }) => {
    const dialog = await search(canvasElement, "harbour");

    await expect(await dialog.findByText("Search isn’t available right now.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(dialog.getByRole("searchbox")).toHaveValue("harbour");
  },
};

export const KeyboardNavigation: Story = {
  args: {
    read: async () => found([round("k7m2p9x4n6rt", "Harbour fund 2027")], many.slice(0, 2)),
  },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await search(canvasElement, "harbour");
    const field = dialog.getByRole("searchbox");
    const top = await dialog.findByRole("option", { name: /^Harbour fund 2027/ });

    // The top match is highlighted as soon as results arrive, so Enter would open it.
    await waitFor(() => expect(field).toHaveAttribute("aria-activedescendant", top.id));

    await userEvent.keyboard("{ArrowDown}{ArrowDown}");

    await expect(field).toHaveAttribute(
      "aria-activedescendant",
      dialog.getByRole("option", { name: /^Harbour project 2/ }).id,
    );
  },
};
