import { useLocation } from "@tanstack/react-router";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import type { NavigationPin } from "@merit/grantmaking/api";
import { ApplicationPage } from "@merit/ui/application-shell";

import { renderWithRouter } from "../../../tests/render-with-router";
import { AppShell } from "../../app/app-shell";
import { NavigationPinsContext, type NavigationPinsState } from "./context";
import { NavigationPinsStatus, NavigationSection, PinnedSection } from "./navigation-section";
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

const alder = { workspaceSlug: "alder", kinds: ["round", "application", "review"] } as const;

const sidebar = () => (
  <>
    <PinnedSection {...alder} />
    <NavigationSection
      title="Funding rounds"
      kind="round"
      workspaceSlug="alder"
      icon="layers"
      location={{ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } }}
    />
  </>
);

const state = (overrides: Partial<NavigationPinsState> = {}): NavigationPinsState => ({
  pins: [],
  loading: false,
  unavailable: false,
  busy: false,
  retry: vi.fn(),
  change: vi.fn(async () => true),
  ...overrides,
});

const pinnedLinks = () =>
  screen
    .getAllByRole("list", { name: /^Pinned / })
    .flatMap((list) => within(list).getAllByRole("link"));

it.each(["community-grants", "earlier-title"])(
  "lists the workspace's pins in saved order and marks only the current pin with %s in its URL",
  async (slug) => {
    const pins = [application, round, { ...second, workspaceSlug: "birch" }];
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
    // Each kind keeps its own saved order: rounds, then applications.
    expect(pinnedLinks().map((link) => link.textContent)).toEqual([
      "Community grants",
      "Community meals",
    ]);
    expect(navigation.getByRole("link", { name: "Community grants" })).toHaveAttribute(
      "href",
      "/app/alder/rounds/community-grants-000000000001",
    );
    expect(
      navigation.getByRole("link", { name: "Community meals Community grants" }),
    ).toHaveAttribute(
      "href",
      "/app/alder/applications/community-meals-000000000003?from=applications",
    );
    expect(navigation.queryByText("Another round")).not.toBeInTheDocument();
  },
);

it("marks the collection as current when the page is not pinned", async () => {
  await renderWithRouter(
    <NavigationPinsContext value={state({ pins: [second] })}>{sidebar()}</NavigationPinsContext>,
    "/app/alder/rounds/community-grants-000000000001",
  );
  expect(screen.getByRole("link", { name: "Funding rounds" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "Another round" })).not.toHaveAttribute("aria-current");
});

it("shows every pin without a cap and collapses the list under its heading", async () => {
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins })}>{sidebar()}</NavigationPinsContext>,
  );
  expect(pinnedLinks()).toHaveLength(7);
  expect(screen.queryByRole("button", { name: /more…/ })).not.toBeInTheDocument();
  const toggle = screen.getByRole("button", { name: /^Pinned\s?7$/ });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("link", { name: "Round 1" })).not.toBeInTheDocument();
});

it("moves a pin only within its own kind's order", async () => {
  const change = vi.fn(async () => true);
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: [round, application, second], change })}>
      {sidebar()}
    </NavigationPinsContext>,
  );
  expect(screen.getByRole("list", { name: "Pinned funding rounds" })).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Pinned applications" })).toBeInTheDocument();
  const trigger = screen.getByRole("link", { name: "Another round" });
  trigger.focus();
  fireEvent.contextMenu(trigger);
  expect(screen.queryByRole("menuitem", { name: "Move down" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: "Move up" }));
  await waitFor(() =>
    expect(change).toHaveBeenCalledWith({
      action: "move",
      target: second.target,
      before: round.target,
    }),
  );
});

it("hides the section when the workspace has no pins", async () => {
  await renderWithRouter(
    <NavigationPinsContext value={state({ pins: [review] })}>{sidebar()}</NavigationPinsContext>,
  );
  expect(screen.queryByRole("button", { name: /^Pinned/ })).not.toBeInTheDocument();
});

it("cancels keyboard reordering without a mutation and keeps focus", async () => {
  const change = vi.fn(async () => true);
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins, change })}>
      {sidebar()}
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

it("drops a dragged pin after the row it lands on", async () => {
  const change = vi.fn(async () => true);
  await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins, change })}>
      {sidebar()}
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
      <PinnedSection {...alder} />
    </NavigationPinsContext>,
  );
  await user.tab();
  await user.tab();
  const link = screen.getByRole("link", { name: "Community meals Community grants" });
  expect(link).toHaveFocus();
  expect(link).toHaveTextContent("Community meals");
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Community meals, Community grants");
});

it("offers accessible reorder and unpin controls with retry after a failed save", async () => {
  const change = vi.fn(async () => false);
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: [round, second], change })}>
      {sidebar()}
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
  await waitFor(() => expect(screen.getByRole("link", { name: "Another round" })).toHaveFocus());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("unpins the last shortcut, retaining it on failure and returning focus to its collection", async () => {
  const change = vi.fn(async () => false);
  const { user } = await renderWithRouter(
    <ManagedPins pins={[round]} change={change} />,
    "/app/alder/rounds",
  );
  const unpin = screen.getByRole("button", { name: "Unpin Community grants from sidebar" });
  unpin.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("Pins could not be saved");
  expect(screen.getByRole("link", { name: "Community grants" })).toBeInTheDocument();
  change.mockResolvedValue(true);
  await user.click(unpin);
  await waitFor(() => expect(screen.getByRole("link", { name: "Funding rounds" })).toHaveFocus());
  expect(screen.queryByRole("button", { name: /^Pinned/ })).not.toBeInTheDocument();
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
      <PinnedSection workspaceSlug="birch" kinds={["review"]} />
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
      {sidebar()}
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

it("does not redirect focus when a pin moves", async () => {
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: manyPins })}>{sidebar()}</NavigationPinsContext>,
  );
  const trigger = screen.getByRole("link", { name: "Round 5" });
  trigger.focus();
  fireEvent.contextMenu(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Move up" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});

const ManagedPins = ({
  pins: initial,
  change,
}: {
  pins: NavigationPin[];
  change?: NavigationPinsState["change"];
}) => {
  const [pins, setPins] = useState(initial);
  return (
    <NavigationPinsContext
      value={state({
        pins,
        change: async (input) => {
          const saved = change ? await change(input) : true;
          if (saved && input.action === "unpin") {
            setPins((items) => items.filter((pin) => pin.target.id !== input.target.id));
          }
          return saved;
        },
      })}
    >
      {sidebar()}
    </NavigationPinsContext>
  );
};

it("moves focus to the next pin after an unpin", async () => {
  const { user } = await renderWithRouter(<ManagedPins pins={manyPins.slice(0, 3)} />);
  await user.click(screen.getByRole("button", { name: "Unpin Round 2 from sidebar" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "Round 3" })).toHaveFocus());
  expect(pinnedLinks()).toHaveLength(2);
});

const NavigationPage = ({ change }: { change: NavigationPinsState["change"] }) => {
  const href = useLocation({ select: (location) => location.href });
  return (
    <NavigationPinsContext value={state({ pins: manyPins, change })}>
      {sidebar()}
      <ApplicationPage locationKey={href} breadcrumb={null} breadcrumbLabel="Breadcrumb">
        <input aria-label="Page field" />
      </ApplicationPage>
    </NavigationPinsContext>
  );
};

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
      <NavigationPage change={change} />,
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

it("keeps focus where the user moved it while an unpin saves", async () => {
  let finish!: (saved: boolean) => void;
  const change = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const { user } = await renderWithRouter(<NavigationPage change={change} />);
  await user.click(screen.getByRole("button", { name: "Unpin Round 1 from sidebar" }));
  const field = screen.getByRole("textbox", { name: "Page field" });
  await user.click(field);
  await act(async () => {
    finish(true);
    await new Promise(requestAnimationFrame);
  });
  expect(field).toHaveFocus();
});
