import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import { renderWithRouter } from "../../tests/render-with-router";
import { searchWorkspace } from "../features/grantmaking/data/server/search.functions";
import { WorkspaceNavigationContext } from "../features/workspace/workspace-navigation";
import { AppShell, type ShellContext, type ShellWorkspace } from "./app-shell";

vi.mock("../features/grantmaking/data/server/search.functions", () => ({
  searchWorkspace: vi.fn(),
}));

const alder: ShellWorkspace = {
  id: "alder",
  name: "Alder Foundation",
  slug: "alder",
  kind: "standard",
  canWorkOnGrants: true,
  canViewTeam: true,
};
const settingsOnly: ShellWorkspace = { ...alder, canWorkOnGrants: false };
const reviewer: ShellWorkspace = { ...alder, canWorkOnGrants: false, canViewTeam: false };

const roundId = "k7m2p9x4n6rt";
const applicationId = "b8q3w5j7c2df";
const found = {
  status: "ok" as const,
  rounds: {
    total: 1,
    results: [
      { id: roundId, title: "Harbour fund", meetingDate: null, matchQuality: "prefix" as const },
    ],
  },
  applications: {
    total: 1,
    results: [
      {
        id: applicationId,
        title: "Boat repairs",
        applicant: "Trust for the Harbour",
        roundId,
        roundTitle: "Harbour fund",
        intakeStatus: "ready" as const,
        withdrawn: false,
        matchQuality: "contains" as const,
      },
    ],
  },
};

const show = (current: ShellContext = { kind: "workspace", workspace: alder }) =>
  renderWithRouter(
    <QueryClientProvider client={createQueryClient()}>
      <WorkspaceNavigationContext value={{ workspaces: [alder], canAdminister: false }}>
        <AppShell current={current}>
          <label>
            Notes
            <input />
          </label>
        </AppShell>
      </WorkspaceNavigationContext>
    </QueryClientProvider>,
    "/app/alder/rounds",
  );

const platform = vi.spyOn(window.navigator, "platform", "get");
beforeEach(() => {
  platform.mockReturnValue("Linux x86_64");
  vi.mocked(searchWorkspace).mockResolvedValue(found);
});
afterEach(() => vi.mocked(searchWorkspace).mockReset());

// user-event answers React Aria's synthetic blur while results render by dispatching `change`
// through act inside React's commit, which React rejects; fireEvent sets the value without it.
const typeText = (box: HTMLElement, text: string) => {
  fireEvent(box, new InputEvent("beforeinput", { inputType: "insertText", bubbles: true }));
  fireEvent.change(box, { target: { value: (box as HTMLInputElement).value + text } });
};

const pressK = (init: KeyboardEventInit, target: Element = document.body) => {
  const event = new KeyboardEvent("keydown", {
    key: "k",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe("the Search button", () => {
  it("sits above Funding rounds with the shortcut for this keyboard", async () => {
    await show();
    const navigation = within(screen.getByRole("complementary")).getByRole("navigation");
    const search = within(navigation).getByRole("button", { name: "Search" });

    expect(search).toHaveTextContent("Ctrl K");
    expect(search).toHaveAttribute("aria-keyshortcuts", "Control+K");
    expect(
      search.compareDocumentPosition(
        within(navigation).getByRole("link", { name: "Funding rounds" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows ⌘K on Apple platforms", async () => {
    platform.mockReturnValue("MacIntel");
    await show();
    const search = screen.getByRole("button", { name: "Search" });

    expect(search).toHaveTextContent("⌘K");
    expect(search).toHaveAttribute("aria-keyshortcuts", "Meta+K");
  });

  it.each([
    ["settings-only members", { kind: "workspace", workspace: settingsOnly }],
    ["reviewers", { kind: "workspace", workspace: reviewer }],
  ] satisfies [string, ShellContext][])("is not offered to %s", async (_name, current) => {
    await show(current);

    expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
    const event = pressK({ ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
  });

  it("opens an empty box with focus in the field", async () => {
    const { user } = await show();
    await user.click(screen.getByRole("button", { name: "Search" }));

    const dialog = await screen.findByRole("dialog", { name: "Search" });
    await waitFor(() => expect(within(dialog).getByRole("searchbox")).toHaveFocus());
    expect(within(dialog).getByRole("searchbox")).toHaveValue("");
    expect(searchWorkspace).not.toHaveBeenCalled();
  });
});

describe("the keyboard shortcut", () => {
  it("opens search from a text field, keeps the browser from using it, and returns focus on Escape", async () => {
    const { user } = await show();
    const notes = screen.getByRole("textbox", { name: "Notes" });
    await user.click(notes);

    const event = pressK({ ctrlKey: true }, notes);

    expect(event.defaultPrevented).toBe(true);
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    await waitFor(() => expect(within(dialog).getByRole("searchbox")).toHaveFocus());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(notes).toHaveFocus());
  });

  it("keeps an open box open, with its text, and focuses the field", async () => {
    const { user } = await show();
    pressK({ ctrlKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    typeText(within(dialog).getByRole("searchbox"), "harbour");
    await user.click(dialog);
    expect(within(dialog).getByRole("searchbox")).not.toHaveFocus();

    pressK({ ctrlKey: true });

    await waitFor(() => expect(within(dialog).getByRole("searchbox")).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "Search" })).toBeVisible();
    expect(within(dialog).getByRole("searchbox")).toHaveValue("harbour");
  });

  it.each([
    {
      name: "⌘K on Apple platforms",
      platform: "MacIntel",
      opens: { metaKey: true },
      ignores: { ctrlKey: true },
    },
    {
      name: "Ctrl+K elsewhere",
      platform: "Win32",
      opens: { ctrlKey: true },
      ignores: { metaKey: true },
    },
  ])("answers only $name", async ({ platform: value, opens, ignores }) => {
    platform.mockReturnValue(value);
    await show();

    expect(pressK(ignores).defaultPrevented).toBe(false);
    expect(pressK({ ...opens, shiftKey: true }).defaultPrevented).toBe(false);
    expect(pressK({ ...opens, altKey: true }).defaultPrevented).toBe(false);
    expect(pressK({ key: "j", ...opens }).defaultPrevented).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    expect(pressK(opens).defaultPrevented).toBe(true);
    expect(await screen.findByRole("dialog", { name: "Search" })).toBeVisible();
  });
});

describe("opening a result", () => {
  it("searches by POST body input and opens the record without a from parameter", async () => {
    const { user, router } = await show();
    await user.click(screen.getByRole("button", { name: "Search" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Search" }));
    typeText(dialog.getByRole("searchbox"), "harbour");

    const application = await dialog.findByRole("option", { name: /Boat repairs/ });

    expect(searchWorkspace).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal) as AbortSignal,
      data: { workspaceSlug: "alder", query: "harbour" },
    });
    expect(dialog.getByRole("option", { name: /^Harbour fund/ })).toHaveAttribute(
      "href",
      `/app/alder/rounds/harbour-fund-${roundId}`,
    );
    expect(application).toHaveAttribute(
      "href",
      `/app/alder/applications/boat-repairs-${applicationId}`,
    );

    await user.click(application);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/app/alder/applications/boat-repairs-${applicationId}`,
      ),
    );
    expect(router.state.location.search).toEqual({});
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
  });
});

describe("navigation", () => {
  it("closes when the location changes, as on Back, not only when a result opens", async () => {
    const { router } = await show();
    pressK({ ctrlKey: true });
    await screen.findByRole("dialog", { name: "Search" });

    await act(() =>
      router.navigate({ to: "/app/$workspaceSlug/activity", params: { workspaceSlug: "alder" } }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("in the mobile drawer", () => {
  const compact = (matches: boolean) =>
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: matches && query === "(max-width: 600px)",
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }),
    });

  afterEach(() => compact(false));

  it("closes the drawer when Search opens, and leaves none behind when a result opens", async () => {
    compact(true);
    const { user, router } = await show();
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog", { name: "Main navigation" })).toBeVisible();

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Search" }));

    const search = await screen.findByRole("dialog", { name: "Search" });
    expect(screen.queryByRole("dialog", { name: "Main navigation" })).not.toBeInTheDocument();
    typeText(within(search).getByRole("searchbox"), "harbour");
    await user.click(await within(search).findByRole("option", { name: /^Boat repairs/ }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/app/alder/applications/boat-repairs-${applicationId}`,
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
