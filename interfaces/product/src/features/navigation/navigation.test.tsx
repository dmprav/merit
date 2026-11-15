import { useLocation } from "@tanstack/react-router";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import type { NavigationPin } from "@merit/grantmaking/api";
import { ApplicationPage } from "@merit/ui/application-shell";

import { renderWithRouter } from "../../../tests/render-with-router";
import { AppShell } from "../../app/app-shell";
import { NavigationPinsContext, type NavigationPinsState } from "./context";
import { NavigationPinsStatus, NavigationSection } from "./navigation-section";
import { PinButton } from "./pin-button";

const round: NavigationPin = {
  target: { kind: "round", id: "000000000001" },
  title: "Community grants",
  context: null,
  workspaceSlug: "alder",
};
const second: NavigationPin = {
  ...round,
  target: { kind: "round", id: "000000000002" },
  title: "Another round",
};
const application: NavigationPin = {
  target: { kind: "application", id: "000000000003" },
  title: "Community meals",
  context: "Community grants",
  workspaceSlug: "alder",
};
const review: NavigationPin = {
  target: { kind: "review", id: "6bca8fde-b474-4ca7-a80b-3bc8af1cc979" },
  title: "Assigned meals",
  context: "Birch Foundation",
  workspaceSlug: "birch",
};

const manyPins = Array.from({ length: 7 }, (_, index): NavigationPin => ({
  ...round,
  target: { kind: "round", id: `00000000000${index + 1}` },
  title: `Round ${index + 1}`,
}));

const section = () => (
  <NavigationSection
    title="Funding rounds"
    kind="round"
    workspaceSlug="alder"
    icon="layers"
    location={{ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } }}
  />
);

it("keeps the preview fixed while the full popup marks the hidden current pin", async () => {
  const change = vi.fn(async () => true);
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins, change })}>
      {section()}
    </NavigationPinsContext>,
    "/app/alder/rounds/round-7-000000000007",
  );
  const preview = within(screen.getByRole("region", { name: "Funding rounds" }));
  expect(preview.getAllByRole("link")).toHaveLength(6);
  expect(preview.getByRole("link", { name: "Funding rounds" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(preview.queryByRole("button", { name: /Reorder/ })).not.toBeInTheDocument();
  const overflow = screen.getByRole("button", { name: "2 more…" });
  await user.click(overflow);
  const popup = within(screen.getByRole("dialog", { name: "Pinned funding rounds" }));
  expect(popup.getAllByRole("link")).toHaveLength(7);
  expect(popup.queryByRole("button", { name: /Reorder/ })).not.toBeInTheDocument();
  await user.tab();
  await user.tab();
  await user.tab();
  expect(popup.getByRole("link", { name: "Round 1" })).toHaveFocus();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(popup.getByRole("link", { name: "Round 7" })).toHaveAttribute("aria-current", "page");
  expect(preview.getAllByRole("link")).toHaveLength(6);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(overflow).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(overflow);
  await user.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Round 1" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(change).not.toHaveBeenCalled();
});

it.each([0, 1, 5])("does not offer overflow for %i pins", async (count) => {
  await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins.slice(0, count) })}>
      {section()}
    </NavigationPinsContext>,
  );
  expect(screen.queryByRole("button", { name: /more…/ })).not.toBeInTheDocument();
});

it("cancels keyboard reordering without a mutation and keeps focus", async () => {
  const change = vi.fn(async () => true);
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins, change })}>
      {section()}
    </NavigationPinsContext>,
  );
  const trigger = screen.getByRole("link", { name: "Round 2" });
  trigger.focus();
  fireEvent.contextMenu(trigger);
  await user.keyboard("{ArrowDown}{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
  fireEvent.contextMenu(trigger);
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  await waitFor(() =>
    expect(change).toHaveBeenCalledWith({
      action: "move",
      target: manyPins[1]!.target,
      before: manyPins[3]!.target,
    }),
  );
});

it.each([6, 7])(
  "moves past the collapsed boundary with %i pins and restores focus",
  async (count) => {
    const change = vi.fn(async () => true);
    const { user } = await renderWithRouter(
      <NavigationPinsContext value={state({ pins: manyPins.slice(0, count), change })}>
        {section()}
      </NavigationPinsContext>,
    );
    fireEvent.contextMenu(screen.getByRole("link", { name: "Round 5" }));
    await user.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(change).toHaveBeenCalledWith({
      action: "move",
      target: manyPins[4]!.target,
      before: count === 6 ? null : manyPins[6]!.target,
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: `${count - 5} more…` })).toHaveFocus(),
    );
  },
);

it("drops after the fifth visible pin before the first hidden pin", async () => {
  const change = vi.fn(async () => true);
  await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins, change })}>
      {section()}
    </NavigationPinsContext>,
  );
  const first = screen.getByRole("link", { name: "Round 1" }).parentElement!;
  const fifth = screen.getByRole("link", { name: "Round 5" }).parentElement!;
  const dataTransfer = { clearData: vi.fn(), setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(first, { dataTransfer });
  fireEvent.dragOver(fifth, { dataTransfer, clientY: 10 });
  expect(fifth).toHaveAttribute("data-drop-position", "after");
  fireEvent.drop(fifth, { dataTransfer, clientY: 10 });
  await waitFor(() =>
    expect(change).toHaveBeenCalledWith({
      action: "move",
      target: manyPins[0]!.target,
      before: manyPins[5]!.target,
    }),
  );
});

it("keeps full context accessible when the visible title is compact", async () => {
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: [application] })}>
      <NavigationSection
        title="Applications"
        kind="application"
        workspaceSlug="alder"
        icon="application"
        location={{ to: "/app/$workspaceSlug/applications", params: { workspaceSlug: "alder" } }}
      />
    </NavigationPinsContext>,
  );
  await user.tab();
  await user.tab();
  const link = screen.getByRole("link", { name: "Community meals Community grants" });
  expect(link).toHaveFocus();
  expect(link).toHaveTextContent("Community meals");
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "Community meals · Community grants",
  );
});

const state = (overrides: Partial<NavigationPinsState> = {}): NavigationPinsState => ({
  pins: [],
  loading: false,
  unavailable: false,
  busy: false,
  retry: vi.fn(),
  change: vi.fn(async () => true),
  ...overrides,
});

it.each(["community-grants", "earlier-title"])(
  "groups pins and marks the current object even with %s in its URL",
  async (slug) => {
    const pins = [round, application, { ...second, workspaceSlug: "birch" }];
    await renderWithRouter(
      <NavigationPinsContext value={state({ pins })}>
        <AppShell
          current={{
            kind: "workspace",
            workspace: {
              id: "alder",
              name: "Alder",
              slug: "alder",
              kind: "standard",
              canWorkOnGrants: true,
              canViewTeam: true,
            },
          }}
        >
          Workspace
        </AppShell>
      </NavigationPinsContext>,
      `/app/alder/rounds/${slug}-000000000001`,
    );
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    expect(navigation.getByRole("link", { current: "page" })).toHaveAccessibleName(
      "Community grants",
    );
    expect(
      within(navigation.getByRole("region", { name: "Funding rounds" })).getByRole("link", {
        name: "Community grants",
      }),
    ).toHaveAttribute("href", "/app/alder/rounds/community-grants-000000000001");
    expect(
      within(navigation.getByRole("region", { name: "Applications" })).getByRole("link", {
        name: "Community meals Community grants",
      }),
    ).toHaveAttribute(
      "href",
      "/app/alder/applications/community-meals-000000000003?from=applications",
    );
    expect(navigation.queryByText("Another round")).not.toBeInTheDocument();
  },
);

it("offers accessible reorder and unpin controls with retry after a failed save", async () => {
  const change = vi.fn(async () => false);
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: [round, second], change })}>
      <NavigationSection
        title="Funding rounds"
        kind="round"
        workspaceSlug="alder"
        icon="layers"
        location={{ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } }}
      />
    </NavigationPinsContext>,
    "/app/alder/rounds",
  );
  const trigger = screen.getByRole("link", { name: "Community grants" });
  trigger.focus();
  fireEvent.contextMenu(trigger);
  expect(screen.queryByRole("menuitem", { name: "Move up" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: "Move down" }));
  await waitFor(() =>
    expect(change).toHaveBeenCalledWith({ action: "move", target: round.target, before: null }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Pins could not be saved");
  change.mockResolvedValue(true);
  await user.click(screen.getByRole("button", { name: "Unpin Community grants from sidebar" }));
  await waitFor(() =>
    expect(change).toHaveBeenLastCalledWith({ action: "unpin", target: round.target }),
  );
  await waitFor(() => expect(screen.getByRole("link", { name: "Funding rounds" })).toHaveFocus());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("unpins a single shortcut directly, retaining it on failure and restoring focus on success", async () => {
  const change = vi.fn(async () => false);
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: [round], change })}>
      <NavigationSection
        title="Funding rounds"
        kind="round"
        workspaceSlug="alder"
        icon="layers"
        location={{ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } }}
      />
    </NavigationPinsContext>,
    "/app/alder/rounds",
  );
  expect(screen.queryByRole("button", { name: /Reorder/ })).not.toBeInTheDocument();
  const unpin = screen.getByRole("button", { name: "Unpin Community grants from sidebar" });
  unpin.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("Pins could not be saved");
  expect(screen.getByRole("link", { name: "Community grants" })).toBeInTheDocument();
  change.mockResolvedValue(true);
  await user.click(unpin);
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(change).toHaveBeenLastCalledWith({ action: "unpin", target: round.target });
  await waitFor(() => expect(screen.getByRole("link", { name: "Funding rounds" })).toHaveFocus());
});

it("links review pins to assignments and keeps the overview available if pins cannot load", async () => {
  const retry = vi.fn();
  const { user } = await renderWithRouter(
    <NavigationPinsContext
      value={state({
        pins: [
          review,
          {
            ...review,
            target: { kind: "review", id: "other" },
            title: "Hidden Alder review",
            workspaceSlug: "alder",
          },
        ],
        unavailable: true,
        retry,
      })}
    >
      <NavigationSection
        title="My work"
        workspaceSlug="birch"
        kind="review"
        icon="edit"
        location={{ to: "/app/$workspaceSlug/work", params: { workspaceSlug: "birch" } }}
      />
      <NavigationPinsStatus />
    </NavigationPinsContext>,
    "/app/birch/work",
  );
  expect(screen.getByRole("link", { name: "My work" })).toHaveAttribute("href", "/app/birch/work");
  expect(screen.getByRole("link", { name: "Assigned meals Birch Foundation" })).toHaveAttribute(
    "href",
    `/app/birch/work/${review.target.id}`,
  );
  expect(screen.queryByText("Hidden Alder review")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Pins could not be loaded");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("does not present a failed pin as saved and allows retry", async () => {
  const change = vi.fn(async () => false);
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ change })}>
      <PinButton target={round.target} title={round.title} />
    </NavigationPinsContext>,
  );
  const button = screen.getByRole("button", { name: "Pin Community grants to sidebar" });
  await user.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent("Pins could not be saved");
  expect(button).toHaveAttribute("aria-pressed", "false");
  change.mockResolvedValue(true);
  await user.click(button);
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(change).toHaveBeenCalledTimes(2);
});

it("ignores duplicate changes while saving and leaves a failed item focused", async () => {
  let finish!: (saved: boolean) => void;
  const change = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins, change })}>
      {section()}
    </NavigationPinsContext>,
  );
  const unpin = screen.getByRole("button", { name: "Unpin Round 1 from sidebar" });
  await user.click(unpin);
  await user.click(unpin);
  expect(change).toHaveBeenCalledTimes(1);
  finish(false);
  expect(await screen.findByRole("alert")).toHaveTextContent("Pins could not be saved");
  expect(unpin).toHaveFocus();
  expect(screen.getByRole("link", { name: "Round 1" })).toBeVisible();
});

it("does not redirect focus when the fifth pin moves upward", async () => {
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins })}>{section()}</NavigationPinsContext>,
  );
  const trigger = screen.getByRole("link", { name: "Round 5" });
  trigger.focus();
  fireEvent.contextMenu(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Move up" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});

const ManagedPins = ({ count, fail = false }: { count: number; fail?: boolean }) => {
  const [pins, setPins] = useState(manyPins.slice(0, count));
  return (
    <NavigationPinsContext
      value={state({
        pins,
        change: async (input) => {
          if (fail) {
            return false;
          }
          if (input.action === "unpin") {
            setPins((items) => items.filter((pin) => pin.target.id !== input.target.id));
          }
          return true;
        },
      })}
    >
      {section()}
    </NavigationPinsContext>
  );
};

it("keeps the popup open after removal, then closes at five and restores collection focus", async () => {
  const { user } = await renderWithRouter(<ManagedPins count={7} />);
  await user.click(screen.getByRole("button", { name: "2 more…" }));
  const popup = within(screen.getByRole("dialog"));
  await user.click(popup.getByRole("button", { name: "Unpin Round 2 from sidebar" }));
  await waitFor(() => expect(popup.getByRole("link", { name: "Round 3" })).toHaveFocus());
  expect(popup.getAllByRole("link")).toHaveLength(6);
  expect(screen.getByRole("button", { name: "1 more…" })).toBeInTheDocument();
  await user.click(popup.getByRole("button", { name: "Unpin Round 3 from sidebar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("link", { name: "Funding rounds" })).toHaveFocus());
  expect(screen.queryByRole("button", { name: /more…/ })).not.toBeInTheDocument();
});

it("retains a failed popup removal and reports the error inside the active surface", async () => {
  const { user } = await renderWithRouter(<ManagedPins count={6} fail />);
  await user.click(screen.getByRole("button", { name: "1 more…" }));
  const popup = within(screen.getByRole("dialog"));
  const unpin = popup.getByRole("button", { name: "Unpin Round 6 from sidebar" });
  await user.click(unpin);
  expect(await popup.findByRole("alert")).toHaveTextContent("Pins could not be saved");
  expect(popup.getAllByRole("link")).toHaveLength(6);
  expect(unpin).toHaveFocus();
});

const NavigationPage = () => {
  const href = useLocation({ select: (location) => location.href });
  return (
    <>
      {section()}
      <ApplicationPage locationKey={href} breadcrumb={null} breadcrumbLabel="Breadcrumb">
        <input aria-label="Page field" />
      </ApplicationPage>
    </>
  );
};

it("closes the pin popup on browser back and forward without taking page focus", async () => {
  const { router, user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins })}>
      <NavigationPage />
    </NavigationPinsContext>,
    "/app/alder/rounds",
  );
  await act(() =>
    router.navigate({ to: "/app/$workspaceSlug/applications", params: { workspaceSlug: "alder" } }),
  );
  for (const navigate of [() => router.history.back(), () => router.history.forward()]) {
    await user.click(screen.getByRole("button", { name: "2 more…" }));
    await act(async () => {
      navigate();
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  }
});

it.each([true, false])(
  "ignores a delayed pin save after leaving and returning to the page (saved=%s)",
  async (saved) => {
    let finish!: (saved: boolean) => void;
    const change = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const { router, user } = await renderWithRouter(
      <NavigationPinsContext value={state({ pins: manyPins, change })}>
        <NavigationPage />
      </NavigationPinsContext>,
      "/app/alder/rounds",
    );
    await user.click(screen.getByRole("button", { name: "Unpin Round 1 from sidebar" }));
    await act(() =>
      router.navigate({
        to: "/app/$workspaceSlug/applications",
        params: { workspaceSlug: "alder" },
      }),
    );
    await act(async () => {
      router.history.back();
    });
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
    await act(async () => {
      finish(saved);
      await new Promise(requestAnimationFrame);
    });
    expect(screen.getByRole("main")).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);

it("keeps focus where the user moved it while a hidden-boundary move saves", async () => {
  let finish!: (saved: boolean) => void;
  const change = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins, change })}>
      <NavigationPage />
    </NavigationPinsContext>,
  );
  fireEvent.contextMenu(screen.getByRole("link", { name: "Round 5" }));
  await user.click(screen.getByRole("menuitem", { name: "Move down" }));
  const field = screen.getByRole("textbox", { name: "Page field" });
  await user.click(field);
  await act(async () => {
    finish(true);
    await new Promise(requestAnimationFrame);
  });
  expect(field).toHaveFocus();
});

it("does not report an old popup save failure in a reopened popup", async () => {
  let finish!: (saved: boolean) => void;
  const change = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins, change })}>
      {section()}
    </NavigationPinsContext>,
  );
  const overflow = screen.getByRole("button", { name: "2 more…" });
  await user.click(overflow);
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Unpin Round 1 from sidebar" }),
  );
  await user.keyboard("{Escape}");
  await user.click(overflow);
  await act(async () => {
    finish(false);
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it.each(["navigation", "focus"])(
  "checks %s again before a scheduled focus recovery runs",
  async (transition) => {
    let finish!: (saved: boolean) => void;
    const change = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const { router, user } = await renderWithRouter(
      <NavigationPinsContext value={state({ pins: manyPins, change })}>
        <NavigationPage />
      </NavigationPinsContext>,
      "/app/alder/rounds",
    );
    await user.click(screen.getByRole("button", { name: "Unpin Round 1 from sidebar" }));
    const frames: FrameRequestCallback[] = [];
    const animation = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => frames.push(callback));
    try {
      await act(async () => {
        finish(true);
      });
      expect(frames.length).toBeGreaterThan(0);
      const field = screen.getByRole("textbox", { name: "Page field" });
      if (transition === "navigation") {
        await act(() =>
          router.navigate({
            to: "/app/$workspaceSlug/applications",
            params: { workspaceSlug: "alder" },
          }),
        );
      } else {
        field.focus();
      }
      act(() => {
        frames.forEach((callback) => callback(0));
      });
      expect(transition === "navigation" ? screen.getByRole("main") : field).toHaveFocus();
    } finally {
      animation.mockRestore();
    }
  },
);

it("keeps overflow open when route data refreshes without navigation", async () => {
  const { router, user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins })}>{section()}</NavigationPinsContext>,
    "/app/alder/rounds",
  );
  await user.click(screen.getByRole("button", { name: "2 more…" }));
  await act(() => router.invalidate());
  expect(screen.getByRole("dialog", { name: "Pinned funding rounds" })).toBeVisible();
});

const DelayedPins = ({ saved }: { saved: Promise<void> }) => {
  const [pins, setPins] = useState(manyPins.slice(0, 6));
  return (
    <NavigationPinsContext
      value={state({
        pins,
        change: async (input) => {
          await saved;
          setPins((items) => items.filter((pin) => pin.target.id !== input.target.id));
          return true;
        },
      })}
    >
      {section()}
    </NavigationPinsContext>
  );
};

it("waits for popup teardown before recovering focus when a save resolves ahead of its render", async () => {
  let finish!: () => void;
  const saved = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const { user } = await renderWithRouter(<DelayedPins saved={saved} />);
  await user.click(screen.getByRole("button", { name: "1 more…" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Unpin Round 6 from sidebar" }),
  );
  const collection = screen.getByRole("link", { name: "Funding rounds" });
  const focus = vi.spyOn(collection, "focus").mockImplementation(() => {});
  const frames: FrameRequestCallback[] = [];
  const animation = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => frames.push(callback));

  const runFrame = () => frames.splice(0).forEach((callback) => callback(0));

  try {
    await act(async () => {
      finish();
      await Promise.resolve();
      await Promise.resolve();
      // A browser frame can run after the save settles but before React removes the popup.
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      runFrame();
      expect(focus).not.toHaveBeenCalled();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const fallbackTarget = document.createElement("button");
    fallbackTarget.textContent = "Skip to content";
    document.body.insertBefore(fallbackTarget, document.body.firstChild);
    const restoreEvent = new CustomEvent("react-aria-focus-scope-restore", {
      bubbles: true,
      cancelable: true,
    });
    const allowFallback = fallbackTarget.dispatchEvent(restoreEvent);
    fallbackTarget.remove();
    expect(allowFallback).toBe(false);
    act(runFrame);
    expect(focus).toHaveBeenCalledOnce();
  } finally {
    animation.mockRestore();
    focus.mockRestore();
  }
});
