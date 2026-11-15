import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { SearchedApplication, SearchedRound, WorkspaceSearch } from "@merit/grantmaking/api";
import { createQueryClient } from "@merit/query";

import { createWorkspaceSearchData } from "../../data/search/workspace-data";
import { GrantmakingMessagesProvider } from "../../messages";
import { WorkspaceSearchDialog, type SearchLinks } from "./workspace-search";

const round = (id: string, overrides: Partial<SearchedRound> = {}): SearchedRound => ({
  id,
  title: "Harbour fund",
  meetingDate: "2027-06-15",
  matchQuality: "contains",
  ...overrides,
});

const application = (
  id: string,
  overrides: Partial<SearchedApplication> = {},
): SearchedApplication => ({
  id,
  title: "Boat repairs",
  applicant: "Trust for the Harbour",
  roundId: "k7m2p9x4n6rt",
  roundTitle: "Harbour fund",
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
    destination.kind === "round"
      ? `/rounds/${destination.round.id}`
      : `/applications/${destination.application.id}`,
  render: ({ kind }, { children, href, ...props }) => (
    <a
      {...props}
      href={href}
      data-kind={kind}
      onClick={(event) => {
        props.onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
};

const Page = ({
  read,
  initiallyOpen = true,
  ...props
}: { read: (query: string, signal: AbortSignal) => Promise<WorkspaceSearch> } & Partial<
  ComponentProps<typeof WorkspaceSearchDialog>
> & { initiallyOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open search
      </button>
      <WorkspaceSearchDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        data={createWorkspaceSearchData({ scope: ["private", "alder"], read })}
        links={links}
        {...props}
      />
    </>
  );
};

const show = (
  read: ComponentProps<typeof Page>["read"],
  props: Partial<ComponentProps<typeof Page>> = {},
) => {
  const user = userEvent.setup();
  const client = createQueryClient();

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <GrantmakingMessagesProvider>{children}</GrantmakingMessagesProvider>
    </QueryClientProvider>
  );

  const view = render(<Page read={read} {...props} />, { wrapper });
  return {
    user,
    update: (next: Partial<ComponentProps<typeof Page>>) =>
      view.rerender(<Page read={read} {...props} {...next} />),
  };
};

const field = () =>
  screen.getByRole("searchbox", { name: "Search funding rounds and applications" });

// user-event answers React Aria's synthetic blur, which moves the highlight while results render,
// by dispatching `change` through act inside React's commit, which React rejects. Typing with
// fireEvent sets the value without user-event's bookkeeping.
const typeText = (box: HTMLElement, text: string) => {
  // React Aria clears its highlight on forward typing, which it learns from `beforeinput`.
  fireEvent(box, new InputEvent("beforeinput", { inputType: "insertText", bubbles: true }));
  fireEvent.change(box, { target: { value: (box as HTMLInputElement).value + text } });
};

const hint = "Search funding rounds and applications by name or applicant.";

describe("opening", () => {
  it("opens empty with focus in the field and only guidance, sending nothing", async () => {
    const read = vi.fn();
    show(read);

    expect(await screen.findByRole("dialog", { name: "Search" })).toBeVisible();
    await waitFor(() => expect(field()).toHaveFocus());
    expect(field()).toHaveValue("");
    expect(screen.getByText(hint)).toBeVisible();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it("has no placeholder repeating the guidance and accepts at most 200 characters", async () => {
    const read = vi.fn();
    const { user } = show(read);
    const box = await screen.findByRole("searchbox");

    expect(box).not.toHaveAttribute("placeholder");
    expect(box).toHaveAttribute("maxlength", "200");
    await user.click(box);
    await user.paste("x".repeat(250));
    expect(box).toHaveValue("x".repeat(200));
  });

  it.each(["   ", "\t \n"])("sends nothing for whitespace %j", async (text) => {
    const read = vi.fn();
    show(read);
    typeText(await screen.findByRole("searchbox"), text);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByText(hint)).toBeVisible();
  });

  it.each([
    ["Escape", async (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Escape}")],
    [
      "the close button",
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole("button", { name: "Close search" })),
    ],
  ])(
    "closes on %s even with text typed, returns focus, and reopens empty",
    async (_name, close) => {
      const read = vi.fn(async () => found([], []));
      const { user } = show(read, { initiallyOpen: false });
      const opener = screen.getByRole("button", { name: "Open search" });
      await user.click(opener);
      typeText(await screen.findByRole("searchbox"), "harbour");
      await waitFor(() => expect(read).toHaveBeenCalled());

      await close(user);

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(opener).toHaveFocus());
      await user.click(opener);
      expect(await screen.findByRole("searchbox")).toHaveValue("");
      expect(screen.getByText(hint)).toBeVisible();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    },
  );

  it("moves focus back to the field when asked to search again", async () => {
    const read = vi.fn();
    const { user, update } = show(read, { focusRequest: 0 });
    typeText(await screen.findByRole("searchbox"), "harbour");
    await user.click(screen.getByRole("button", { name: "Close search" }));
    await user.click(screen.getByRole("button", { name: "Open search" }));
    await screen.findByRole("searchbox");
    await user.click(screen.getByRole("dialog"));
    expect(field()).not.toHaveFocus();

    update({ focusRequest: 1 });

    await waitFor(() => expect(field()).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "Search" })).toBeVisible();
  });
});

describe("requests", () => {
  it("waits for typing to pause, sends the trimmed text once, and cancels the older request", async () => {
    const signals: AbortSignal[] = [];
    const queries: string[] = [];
    const read = vi.fn(async (query: string, signal: AbortSignal) => {
      queries.push(query);
      signals.push(signal);
      return new Promise<WorkspaceSearch>(() => {});
    });
    show(read);
    typeText(await screen.findByRole("searchbox"), "  har");

    expect(read).not.toHaveBeenCalled();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(queries).toEqual(["har"]);

    typeText(field(), "bour ");
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));

    expect(queries).toEqual(["har", "harbour"]);
    await waitFor(() => expect(signals[0]!.aborted).toBe(true));
    expect(signals[1]!.aborted).toBe(false);
  });

  it("keeps the previous results visible and busy while the next ones load", async () => {
    let finish: (value: WorkspaceSearch) => void = () => {};

    const read = vi.fn(async (query: string) =>
      query === "harbour"
        ? found([round("k7m2p9x4n6rt")], [])
        : new Promise<WorkspaceSearch>((resolve) => (finish = resolve)),
    );
    show(read);
    typeText(await screen.findByRole("searchbox"), "harbour");
    expect(await screen.findByRole("option", { name: /Harbour fund/ })).toBeVisible();

    typeText(field(), " trust");

    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    const results = screen.getByRole("listbox", { name: "Search results" });
    expect(results.closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    expect(within(results).getByRole("option", { name: /Harbour fund/ })).toBeVisible();

    finish(found([], [application("b8q3w5j7c2df")]));

    expect(await screen.findByRole("option", { name: /Boat repairs/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /^Harbour fund/ })).not.toBeInTheDocument();
    expect(screen.getByRole("listbox").closest("[aria-busy]")).toBeNull();
  });
});

describe("results", () => {
  it("groups rounds and applications with their facts, labels and totals", async () => {
    const read = vi.fn(async () =>
      found(
        [
          round("k7m2p9x4n6rt"),
          round("h7m2p9x4n6rt", { title: "Spring grants", meetingDate: null }),
        ],
        [
          application("b8q3w5j7c2df"),
          application("c8q3w5j7c2df", {
            title: "Quayside lights",
            applicant: null,
            intakeStatus: "in_preparation",
          }),
          application("d8q3w5j7c2df", {
            title: "Old slipway",
            intakeStatus: "in_preparation",
            withdrawn: true,
          }),
        ],
        { applications: 43 },
      ),
    );
    show(read);
    typeText(await screen.findByRole("searchbox"), "harbour");

    const rounds = await screen.findByRole("group", { name: /^Funding rounds/ });
    const applications = screen.getByRole("group", { name: /^Applications/ });
    expect(
      rounds.compareDocumentPosition(applications) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(rounds).getByRole("option", { name: /Harbour fund/ })).toHaveTextContent(
      "15 June 2027",
    );
    expect(within(rounds).getByRole("option", { name: /Spring grants/ })).toHaveTextContent(
      "Not scheduled",
    );
    expect(within(rounds).getByRole("option", { name: /Harbour fund/ })).toHaveAttribute(
      "href",
      "/rounds/k7m2p9x4n6rt",
    );

    const boat = within(applications).getByRole("option", { name: /Boat repairs/ });
    expect(boat).toHaveTextContent("Trust for the Harbour · Harbour fund");
    expect(boat).not.toHaveTextContent("In preparation");
    expect(boat).not.toHaveTextContent("Withdrawn");
    expect(boat).toHaveAttribute("href", "/applications/b8q3w5j7c2df");
    expect(within(applications).getByRole("option", { name: /Quayside lights/ })).toHaveTextContent(
      "Applicant not known · Harbour fund",
    );
    expect(within(applications).getByRole("option", { name: /Quayside lights/ })).toHaveTextContent(
      "In preparation",
    );
    const withdrawn = within(applications).getByRole("option", { name: /Old slipway/ });
    expect(withdrawn).toHaveTextContent("Withdrawn");
    expect(withdrawn).not.toHaveTextContent("In preparation");
    expect(
      within(applications).getByText("Showing 3 of 43 applications. Type more to narrow."),
    ).toBeVisible();
    expect(within(rounds).queryByText(/Type more to narrow/)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "2 funding rounds, 3 of 43 applications",
      ),
    );
  });

  it("lists applications first when only they hold an exact match", async () => {
    const read = vi.fn(async () =>
      found([round("k7m2p9x4n6rt")], [application("b8q3w5j7c2df", { matchQuality: "exact" })]),
    );
    show(read);
    typeText(await screen.findByRole("searchbox"), "boat repairs");

    const applications = await screen.findByRole("group", { name: /^Applications/ });
    const rounds = screen.getByRole("group", { name: /^Funding rounds/ });
    expect(
      applications.compareDocumentPosition(rounds) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("omits a group without matches and reports 'No results' when nothing matches", async () => {
    const read = vi.fn(async (query: string) =>
      query === "harbr" ? found([], []) : found([round("k7m2p9x4n6rt")], []),
    );
    const { user } = show(read);
    typeText(await screen.findByRole("searchbox"), "harbour");

    await screen.findByRole("group", { name: /^Funding rounds/ });
    expect(screen.queryByRole("group", { name: /^Applications/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 funding round"));

    await user.clear(field());
    typeText(field(), "harbr");

    expect(
      await screen.findByText("No funding rounds or applications match “harbr”."),
    ).toBeVisible();
    expect(field()).toHaveValue("harbr");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No results"));
  });

  it("names the query its results answer, not newer text still loading", async () => {
    const read = vi.fn(async (query: string) =>
      query === "harbr" ? found([], []) : new Promise<WorkspaceSearch>(() => {}),
    );
    show(read);
    typeText(await screen.findByRole("searchbox"), "harbr");
    expect(
      await screen.findByText("No funding rounds or applications match “harbr”."),
    ).toBeVisible();

    typeText(field(), "o");
    await waitFor(() => expect(read).toHaveBeenCalledWith("harbro", expect.any(AbortSignal)));

    expect(screen.getByText("No funding rounds or applications match “harbr”.")).toBeVisible();
    expect(screen.queryByText(/match “harbro”/)).not.toBeInTheDocument();
  });

  it("closes when a row opens in this tab", async () => {
    const read = vi.fn(async () => found([round("k7m2p9x4n6rt")], [application("b8q3w5j7c2df")]));
    const { user } = show(read);
    typeText(await screen.findByRole("searchbox"), "harbour");
    await user.click(await screen.findByRole("option", { name: /Boat repairs/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the box open for a modifier-click", async () => {
    const read = vi.fn(async () => found([round("k7m2p9x4n6rt")], []));
    const { user } = show(read);
    typeText(await screen.findByRole("searchbox"), "harbour");
    const row = await screen.findByRole("option", { name: /Harbour fund/ });

    await user.keyboard("{Control>}");
    await user.click(row);
    await user.keyboard("{/Control}");

    expect(screen.getByRole("dialog", { name: "Search" })).toBeVisible();
  });
});

describe("highlight", () => {
  it("highlights the top match when results arrive, so Enter opens it", async () => {
    const read = vi.fn(async () => found([round("k7m2p9x4n6rt")], [application("b8q3w5j7c2df")]));
    const { user } = show(read);
    typeText(await screen.findByRole("searchbox"), "harbour");
    const top = await screen.findByRole("option", { name: /^Harbour fund/ });

    await waitFor(() => expect(field()).toHaveAttribute("aria-activedescendant", top.id));
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("highlights nothing while results for a newer query load, and Enter does nothing", async () => {
    const read = vi.fn(async (query: string) =>
      query === "harbour"
        ? found([round("k7m2p9x4n6rt")], [])
        : new Promise<WorkspaceSearch>(() => {}),
    );
    const { user } = show(read);
    typeText(await screen.findByRole("searchbox"), "harbour");
    const top = await screen.findByRole("option", { name: /^Harbour fund/ });
    await waitFor(() => expect(field()).toHaveAttribute("aria-activedescendant", top.id));

    typeText(field(), " trust");

    expect(top).toBeVisible();
    expect(field()).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Search" })).toBeVisible();
  });
});

describe("loading feedback", () => {
  const busy = () => field().closest("[aria-busy]");

  it("shows the first request as busy instead of the guidance", async () => {
    const read = vi.fn(() => new Promise<WorkspaceSearch>(() => {}));
    show(read);
    typeText(await screen.findByRole("searchbox"), "harbour");

    expect(busy()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(busy()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it("shows a retry as busy while it reads again", async () => {
    const read = vi
      .fn<(query: string, signal: AbortSignal) => Promise<WorkspaceSearch>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockImplementation(() => new Promise<WorkspaceSearch>(() => {}));
    const { user } = show(read);
    typeText(await screen.findByRole("searchbox"), "harbour");
    await screen.findByText("Search isn’t available right now.");
    expect(busy()).toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(busy()).toHaveAttribute("aria-busy", "true"));
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });
});

describe("failure", () => {
  it("keeps the typed text, offers to try again, and reruns the current query", async () => {
    const read = vi
      .fn<(query: string, signal: AbortSignal) => Promise<WorkspaceSearch>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(found([round("k7m2p9x4n6rt")], []));
    const { user } = show(read);
    typeText(await screen.findByRole("searchbox"), "harbour");

    expect(await screen.findByText("Search isn’t available right now.")).toBeVisible();
    expect(field()).toHaveValue("harbour");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("option", { name: /Harbour fund/ })).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls.map(([query]) => query)).toEqual(["harbour", "harbour"]);
    expect(screen.queryByText("Search isn’t available right now.")).not.toBeInTheDocument();
  });
});
