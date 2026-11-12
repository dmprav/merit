import { screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import type { NavigationPin } from "@merit/grantmaking/api";

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
  workspaceSlug: null,
};

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
        name: "Community meals · Community grants",
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
  const trigger = screen.getByRole("button", { name: "Pin actions for Community grants" });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("menuitem", { name: "Move up" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: "Move down" }));
  await waitFor(() =>
    expect(change).toHaveBeenCalledWith({ action: "move", target: round.target, before: null }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Pins could not be saved");
  change.mockResolvedValue(true);
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Unpin" }));
  await waitFor(() =>
    expect(change).toHaveBeenLastCalledWith({ action: "unpin", target: round.target }),
  );
  await waitFor(() => expect(screen.getByRole("link", { name: "Funding rounds" })).toHaveFocus());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("links review pins to assignments and keeps the overview available if pins cannot load", async () => {
  const retry = vi.fn();
  const { user } = await renderWithRouter(
    <NavigationPinsContext value={state({ pins: [review], unavailable: true, retry })}>
      <NavigationSection
        title="My reviews"
        kind="review"
        icon="edit"
        location={{ to: "/reviews" }}
      />
      <NavigationPinsStatus />
    </NavigationPinsContext>,
    "/reviews",
  );
  expect(screen.getByRole("link", { name: "My reviews" })).toHaveAttribute("href", "/reviews");
  expect(screen.getByRole("link", { name: "Assigned meals · Birch Foundation" })).toHaveAttribute(
    "href",
    `/reviews/${review.target.id}`,
  );
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
  const button = screen.getByRole("button", { name: "Pin Community grants" });
  await user.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent("Pins could not be saved");
  expect(button).toHaveAttribute("aria-pressed", "false");
  change.mockResolvedValue(true);
  await user.click(button);
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(change).toHaveBeenCalledTimes(2);
});
