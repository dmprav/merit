import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import {
  ApplicationAccount,
  ApplicationContext,
  ApplicationContextOption,
  ApplicationShell,
} from "./application-shell";

let compact = true;
let listeners: (() => void)[] = [];
beforeEach(() => {
  compact = true;
  listeners = [];
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query === "(max-width: 600px)" && compact,
      media: query,
      addEventListener: (_: string, listener: () => void) => {
        listeners.push(listener);
      },
      removeEventListener: (_: string, listener: () => void) => {
        listeners = listeners.filter((value) => value !== listener);
      },
      addListener: () => {},
      removeListener: () => {},
    }),
  });
});
const shell = (
  <ApplicationShell
    brand={<a href="/">merit</a>}
    contextLabel="Alder Foundation"
    identity={<p>Alder Foundation</p>}
    navigation={<a href="#main">Funding rounds</a>}
    navigationLabel="Main navigation"
    skipLabel="Skip to content"
    openNavigationLabel="Open navigation"
    closeNavigationLabel="Close navigation"
    footer={<p>Dana Reed</p>}
  >
    <main id="main" tabIndex={-1}>
      <h1>Grant work</h1>
    </main>
  </ApplicationShell>
);

it("opens mobile navigation, dismisses with Escape and restores focus", async () => {
  const user = userEvent.setup();
  render(shell);

  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Open navigation" });
  await user.click(trigger);
  const drawer = screen.getByRole("dialog", { name: "Main navigation" });

  expect(within(drawer).getByRole("link", { name: "Funding rounds" })).toBeVisible();
  expect(within(drawer).getByText("Dana Reed")).toBeVisible();

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("closes after navigation and places focus in the work", async () => {
  const user = userEvent.setup();
  render(shell);
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  await user.click(screen.getByRole("link", { name: "Funding rounds" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
});

it("releases the modal when resizing to desktop", async () => {
  const user = userEvent.setup();
  render(shell);
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  act(() => {
    compact = false;
    listeners.forEach((listener) => listener());
  });

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(within(screen.getByRole("complementary")).getByRole("navigation")).toBeVisible();
});

it("switches with keyboard links and restores the trigger on Escape", async () => {
  compact = false;
  const user = userEvent.setup();
  render(
    <ApplicationContext name="Alder Foundation" label="Switch workspace">
      <a href="#alder" aria-current="true">
        <ApplicationContextOption name="Alder Foundation" />
      </a>
      <a href="#birch">
        <ApplicationContextOption name="Birch Foundation" />
      </a>
    </ApplicationContext>,
  );
  const trigger = screen.getByRole("button", { name: "Alder Foundation: Switch workspace" });
  await user.tab();
  await user.keyboard("{Enter}");
  const dialog = screen.getByRole("dialog", { name: "Switch workspace" });
  const current = within(dialog).getByRole("link", { name: "Alder Foundation" });

  expect(current).toHaveAttribute("aria-current", "true");
  await user.tab();
  await waitFor(() => expect(current).toHaveFocus());
  await user.keyboard("{Escape}");

  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.keyboard("{Enter}");
  await user.tab();
  await user.tab();

  expect(screen.getByRole("link", { name: "Birch Foundation" })).toHaveFocus();

  await user.keyboard("{Enter}");

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps the switcher open when a workspace opens in another tab", async () => {
  compact = false;
  const user = userEvent.setup();
  render(
    <ApplicationContext name="Alder Foundation" label="Switch workspace">
      <a href="#birch">
        <ApplicationContextOption name="Birch Foundation" />
      </a>
    </ApplicationContext>,
  );
  await user.click(screen.getByRole("button", { name: "Alder Foundation: Switch workspace" }));
  await user.keyboard("{Control>}");
  await user.click(screen.getByRole("link", { name: "Birch Foundation" }));
  await user.keyboard("{/Control}");

  expect(screen.getByRole("dialog", { name: "Switch workspace" })).toBeVisible();
});

it("shows sign-out progress and allows retry after failure", async () => {
  const user = userEvent.setup();
  let reject!: (reason: Error) => void;
  const run = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue(undefined);
  render(
    <ApplicationAccount
      name="Dana Reed"
      loadingLabel="Loading account"
      menuLabel="Account menu"
      signOut={{
        label: "Sign out",
        pendingLabel: "Signing out",
        errorMessage: "Sign out failed. Try again.",
        run,
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Dana Reed: Account menu" }));
  await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

  expect(screen.getByRole("button", { name: "Dana Reed: Account menu" })).toHaveAttribute(
    "data-pending",
  );

  await act(async () => reject(new Error("offline")));

  expect(screen.getByRole("alert")).toHaveTextContent("Sign out failed");

  await user.click(screen.getByRole("button", { name: "Dana Reed: Account menu" }));
  await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

  await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps demo and local identities static without offering a false sign-out action", () => {
  render(
    <ApplicationAccount name="Dana Reed" loadingLabel="Loading account" menuLabel="Account menu" />,
  );

  expect(screen.getByText("Dana Reed")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
