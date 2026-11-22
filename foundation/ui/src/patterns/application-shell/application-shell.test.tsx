import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { ActionMenu } from "../../components/action-menu/action-menu";
import { Button } from "../../components/button/button";
import {
  ApplicationAccount,
  ApplicationContext,
  ApplicationContextOption,
  ApplicationShell,
  useCloseNavigation,
} from "./application-shell";

let compact = true;
let wide = false;
let listeners: (() => void)[] = [];
beforeEach(() => {
  compact = true;
  wide = false;
  listeners = [];
  document.documentElement.removeAttribute("style");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches:
        (query === "(max-width: 600px)" && compact) || (query === "(min-width: 1400px)" && wide),
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

const SearchAction = ({ onSearch }: { onSearch: () => void }) => {
  const closeNavigation = useCloseNavigation();
  return (
    <Button
      size="medium"
      onPress={() => {
        closeNavigation();
        onSearch();
      }}
    >
      Search
    </Button>
  );
};

it("lets a navigation action close the drawer before it opens something over the page", async () => {
  const user = userEvent.setup();
  const onSearch = vi.fn();
  render(
    <ApplicationShell
      brand={<a href="/">merit</a>}
      contextLabel="Alder Foundation"
      navigation={<SearchAction onSearch={onSearch} />}
      navigationLabel="Main navigation"
      skipLabel="Skip to content"
      openNavigationLabel="Open navigation"
      closeNavigationLabel="Close navigation"
    >
      <main id="main" tabIndex={-1}>
        <h1>Grant work</h1>
      </main>
    </ApplicationShell>,
  );
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  await user.click(screen.getByRole("button", { name: "Search" }));

  expect(onSearch).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog", { name: "Main navigation" })).not.toBeInTheDocument();
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

const changeViewport = (changes: { compact?: boolean; wide?: boolean }) =>
  act(() => {
    compact = changes.compact ?? compact;
    wide = changes.wide ?? wide;
    listeners.forEach((listener) => listener());
  });

const Companion = ({
  onWidthChange,
  onClose,
  width,
  panelContent,
  openerGone = false,
}: {
  onWidthChange?: (width: number) => void;
  onClose?: () => void;
  width?: number;
  panelContent?: ReactNode;
  openerGone?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [showOpener, setShowOpener] = useState(true);
  // Stands in for a caller-owned toggle shortcut that closes the panel from anywhere on the page.
  useEffect(() => {
    const closeFromPage = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", closeFromPage);
    return () => document.removeEventListener("keydown", closeFromPage);
  }, []);
  return (
    <ApplicationShell
      brand={<a href="/">merit</a>}
      contextLabel="Alder Foundation"
      navigation={<a href="#main">Funding rounds</a>}
      navigationLabel="Main navigation"
      skipLabel="Skip to content"
      openNavigationLabel="Open navigation"
      closeNavigationLabel="Close navigation"
      companion={{
        label: "Assistant",
        isOpen: open,
        onClose: () => {
          onClose?.();
          setOpen(false);
        },
        closeLabel: "Close assistant",
        resizeLabel: "Resize assistant",
        width,
        onWidthChange,
        children: panelContent ?? <button type="button">Ask</button>,
      }}
    >
      <main id="main" tabIndex={-1}>
        <h1>Grant work</h1>
        <input aria-label="Page note" />
        {showOpener && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              if (openerGone) {
                setShowOpener(false);
              }
            }}
          >
            Open assistant
          </button>
        )}
      </main>
    </ApplicationShell>
  );
};

it("renders no companion region without a companion panel or while it is closed", () => {
  compact = false;
  wide = true;
  render(<Companion />);

  expect(screen.queryByRole("complementary", { name: "Assistant" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue("--companion-width")).toBe("");
});

it("pushes the page aside with a labelled region on wide screens", async () => {
  compact = false;
  wide = true;
  const user = userEvent.setup();
  render(<Companion />);
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  const panel = screen.getByRole("complementary", { name: "Assistant" });

  expect(within(panel).getByRole("heading", { name: "Assistant" })).toBeVisible();
  expect(within(panel).getByRole("button", { name: "Ask" })).toBeVisible();
  expect(screen.getByRole("main")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue("--companion-width")).toBe("416px");

  await user.click(within(panel).getByRole("button", { name: "Close assistant" }));

  expect(screen.queryByRole("complementary", { name: "Assistant" })).not.toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue("--companion-width")).toBe("");
});

it("moves focus into the panel, then back to its opener", async () => {
  compact = false;
  wide = true;
  const user = userEvent.setup();
  render(<Companion />);
  const opener = screen.getByRole("button", { name: "Open assistant" });
  await user.click(opener);

  await waitFor(() =>
    expect(screen.getByRole("complementary", { name: "Assistant" })).toHaveFocus(),
  );

  await user.click(screen.getByRole("button", { name: "Close assistant" }));

  await waitFor(() => expect(opener).toHaveFocus());
});

it("makes the pushed panel's content reachable by keyboard so it can scroll", async () => {
  compact = false;
  wide = true;
  const user = userEvent.setup();
  render(<Companion />);
  await user.click(screen.getByRole("button", { name: "Open assistant" }));

  const body = within(screen.getByRole("complementary", { name: "Assistant" })).getByRole(
    "region",
    { name: "Assistant" },
  );

  expect(body).toHaveAttribute("tabindex", "0");
});

it("keeps the pushed panel open when Escape cancels an IME composition", async () => {
  compact = false;
  wide = true;
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<Companion onClose={onClose} />);
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  const ask = screen.getByRole("button", { name: "Ask" });

  fireEvent.keyDown(ask, { key: "Escape", isComposing: true });

  expect(onClose).not.toHaveBeenCalled();

  fireEvent.keyDown(ask, { key: "Escape" });

  expect(onClose).toHaveBeenCalledOnce();
});

it("focuses the element the caller marks instead of the panel", async () => {
  compact = false;
  wide = true;
  const user = userEvent.setup();
  render(
    <Companion
      panelContent={
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        <input aria-label="Message" autoFocus />
      }
    />,
  );
  await user.click(screen.getByRole("button", { name: "Open assistant" }));

  expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
});

it("closes on Escape inside the panel and returns focus to the opener", async () => {
  compact = false;
  wide = true;
  const user = userEvent.setup();
  render(<Companion />);
  const opener = screen.getByRole("button", { name: "Open assistant" });
  await user.click(opener);
  await user.click(screen.getByRole("button", { name: "Ask" }));
  await user.keyboard("{Escape}");

  expect(screen.queryByRole("complementary", { name: "Assistant" })).not.toBeInTheDocument();
  await waitFor(() => expect(opener).toHaveFocus());
});

it("returns focus to the main content when the opener is gone", async () => {
  compact = false;
  wide = true;
  const user = userEvent.setup();
  render(<Companion openerGone />);
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  await user.click(screen.getByRole("button", { name: "Close assistant" }));

  await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
});

it("leaves focus in a page field when the caller closes the panel", async () => {
  compact = false;
  wide = true;
  const user = userEvent.setup();
  render(<Companion />);
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  const field = screen.getByRole("textbox", { name: "Page note" });
  await user.click(field);
  await user.keyboard("{F2}");

  expect(screen.queryByRole("complementary", { name: "Assistant" })).not.toBeInTheDocument();
  await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
  await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));

  expect(field).toHaveFocus();
});

it("lets an open menu in the panel use Escape before the panel does", async () => {
  compact = false;
  wide = true;
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <Companion
      onClose={onClose}
      panelContent={
        <ActionMenu
          label="Conversation actions"
          trigger={<Button size="medium">Actions</Button>}
          items={[{ id: "clear", label: "Clear conversation" }]}
          onAction={() => {}}
        />
      }
    />,
  );
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  await user.click(screen.getByRole("button", { name: "Actions" }));
  expect(screen.getByRole("menu")).toBeVisible();
  await user.keyboard("{Escape}");

  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("complementary", { name: "Assistant" })).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: "Actions" })).toHaveFocus());

  await user.keyboard("{Escape}");

  expect(onClose).toHaveBeenCalledOnce();
});

it("resizes from the separator with the keyboard between 400 and 560 pixels", async () => {
  compact = false;
  wide = true;
  const onWidthChange = vi.fn();
  const user = userEvent.setup();
  render(<Companion onWidthChange={onWidthChange} />);
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  const separator = screen.getByRole("separator", { name: "Resize assistant" });

  expect(separator).toHaveAttribute("aria-valuenow", "416");
  expect(separator).toHaveAttribute("aria-valuemin", "400");
  expect(separator).toHaveAttribute("aria-valuemax", "560");

  separator.focus();
  await user.keyboard("{ArrowLeft}");

  expect(separator).toHaveAttribute("aria-valuenow", "432");
  expect(onWidthChange).toHaveBeenLastCalledWith(432);
  expect(document.documentElement.style.getPropertyValue("--companion-width")).toBe("432px");

  await user.keyboard("{ArrowRight}{ArrowRight}");

  expect(separator).toHaveAttribute("aria-valuenow", "400");

  await user.keyboard("{ArrowRight}");

  expect(onWidthChange).toHaveBeenCalledTimes(3);

  await user.keyboard("{End}");

  expect(separator).toHaveAttribute("aria-valuenow", "560");

  await user.keyboard("{ArrowLeft}");

  expect(onWidthChange).toHaveBeenCalledTimes(4);
  expect(onWidthChange).toHaveBeenLastCalledWith(560);

  await user.keyboard("{Home}");

  expect(separator).toHaveAttribute("aria-valuenow", "400");
});

it("starts at the width the caller gives, kept within the limits", async () => {
  compact = false;
  wide = true;
  const user = userEvent.setup();
  render(<Companion width={900} />);
  await user.click(screen.getByRole("button", { name: "Open assistant" }));

  expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "560");
});

it("resizes by dragging the separator and reports the width when the pointer is released", async () => {
  compact = false;
  wide = true;
  const onWidthChange = vi.fn();
  const user = userEvent.setup();
  render(<Companion onWidthChange={onWidthChange} />);
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  const separator = screen.getByRole("separator");

  await user.pointer([
    { keys: "[MouseLeft>]", target: separator, coords: { clientX: 1000 } },
    { coords: { clientX: 940 } },
  ]);

  expect(separator).toHaveAttribute("aria-valuenow", "476");
  expect(onWidthChange).not.toHaveBeenCalled();

  await user.pointer([{ coords: { clientX: 500 } }]);

  expect(separator).toHaveAttribute("aria-valuenow", "560");

  await user.pointer([{ keys: "[/MouseLeft]" }]);

  expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(560);
});

it("toggles between the default and widest width when the separator is pressed without dragging", async () => {
  compact = false;
  wide = true;
  const onWidthChange = vi.fn();
  const user = userEvent.setup();
  render(<Companion onWidthChange={onWidthChange} />);
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  const separator = screen.getByRole("separator");

  await user.click(separator);

  expect(separator).toHaveAttribute("aria-valuenow", "560");
  expect(onWidthChange).toHaveBeenLastCalledWith(560);

  await user.click(separator);

  expect(separator).toHaveAttribute("aria-valuenow", "416");
  expect(onWidthChange).toHaveBeenLastCalledWith(416);
  expect(onWidthChange).toHaveBeenCalledTimes(2);
});

it("opens as a modal sheet on narrower screens, without resizing", async () => {
  compact = false;
  const user = userEvent.setup();
  render(<Companion />);
  const opener = screen.getByRole("button", { name: "Open assistant" });
  await user.click(opener);
  const sheet = screen.getByRole("dialog", { name: "Assistant" });

  expect(screen.queryByRole("complementary", { name: "Assistant" })).not.toBeInTheDocument();
  expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  expect(within(sheet).getByRole("button", { name: "Close assistant" })).toBeVisible();
  expect(document.documentElement.style.getPropertyValue("--companion-width")).toBe("");

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(opener).toHaveFocus());
});

it("closes the modal sheet from its Close button and by clicking outside it", async () => {
  compact = false;
  const user = userEvent.setup();
  render(<Companion />);
  const opener = screen.getByRole("button", { name: "Open assistant" });
  await user.click(opener);
  await user.click(screen.getByRole("button", { name: "Close assistant" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(opener).toHaveFocus());

  await user.click(opener);
  await user.click(document.body);

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps focus inside the modal sheet", async () => {
  compact = false;
  const user = userEvent.setup();
  render(<Companion />);
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  const sheet = screen.getByRole("dialog", { name: "Assistant" });
  await user.tab();
  await user.tab();
  await user.tab();

  expect(sheet.contains(document.activeElement)).toBe(true);
  expect(screen.queryByRole("main")).not.toBeInTheDocument();
});

it("keeps the panel open and changes its presentation when crossing 1400 pixels", async () => {
  compact = false;
  const user = userEvent.setup();
  render(<Companion />);
  const opener = screen.getByRole("button", { name: "Open assistant" });
  await user.click(opener);

  expect(screen.getByRole("dialog", { name: "Assistant" })).toBeVisible();

  changeViewport({ wide: true });

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const panel = screen.getByRole("complementary", { name: "Assistant" });
  expect(panel).toBeVisible();
  await waitFor(() => expect(panel).toHaveFocus());

  changeViewport({ wide: false });

  const sheet = screen.getByRole("dialog", { name: "Assistant" });
  expect(screen.queryByRole("complementary", { name: "Assistant" })).not.toBeInTheDocument();
  await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));

  await user.keyboard("{Escape}");

  await waitFor(() => expect(opener).toHaveFocus());
});
