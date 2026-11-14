import { QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import { renderWithRouter } from "../../tests/render-with-router";
import { WorkspaceNavigationContext } from "../features/workspace/workspace-navigation";
import { AppShell, type ShellWorkspace } from "./app-shell";

const alder: ShellWorkspace = {
  id: "alder",
  name: "Alder Foundation",
  slug: "alder",
  kind: "standard",
  canWorkOnGrants: true,
};
const birch: ShellWorkspace = {
  id: "birch",
  name: "Birch Foundation",
  slug: "birch",
  kind: "standard",
  canWorkOnGrants: false,
};
const workspaces = [alder, birch];

describe("workspace switching", () => {
  it("keeps a single accessible workspace static", async () => {
    await renderWithRouter(
      <WorkspaceNavigationContext value={{ workspaces: [alder], canAdminister: false }}>
        <AppShell current={{ kind: "workspace", workspace: alder }}>Workspace</AppShell>
      </WorkspaceNavigationContext>,
      "/app/alder/rounds",
    );

    expect(within(screen.getByRole("complementary")).getByText("Alder Foundation")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Switch workspace/ })).not.toBeInTheDocument();
  });

  it("keeps the workspace identity when discovery has nothing to offer", async () => {
    await renderWithRouter(
      <AppShell current={{ kind: "workspace", workspace: alder }}>Workspace</AppShell>,
      "/app/alder/rounds",
    );

    expect(within(screen.getByRole("complementary")).getByText("Alder Foundation")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Switch workspace/ })).not.toBeInTheDocument();
  });

  it("switches directly to an accessible workspace from the identity above navigation", async () => {
    const { user, router } = await renderWithRouter(
      <WorkspaceNavigationContext value={{ workspaces, canAdminister: false }}>
        <AppShell current={{ kind: "workspace", workspace: alder }}>Workspace</AppShell>
      </WorkspaceNavigationContext>,
      "/app/alder/rounds",
    );
    const sidebar = screen.getByRole("complementary");
    const link = within(sidebar).getByRole("button", {
      name: "Alder Foundation: Switch workspace",
    });

    expect(link).toHaveTextContent("Alder Foundation");
    expect(
      link.compareDocumentPosition(within(sidebar).getByRole("navigation")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    link.focus();
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("link", { name: "My workspaces" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alder Foundation" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(screen.getByRole("link", { name: "Birch Foundation" }));

    expect(router.state.location.pathname).toBe("/app/birch/settings/members");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers administration only when the server grants operator navigation", async () => {
    await renderWithRouter(
      <WorkspaceNavigationContext value={{ workspaces: [alder], canAdminister: true }}>
        <AppShell current={{ kind: "workspace", workspace: alder }}>Workspace</AppShell>
      </WorkspaceNavigationContext>,
      "/app/alder/rounds",
    );

    expect(screen.queryByRole("button", { name: /Switch workspace/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute(
      "href",
      "/admin/organizations",
    );
    expect(screen.queryByRole("link", { name: "My workspaces" })).not.toBeInTheDocument();
  });

  it("labels demo choices and keeps the current workspace marked", async () => {
    const demo = { ...alder, id: "demo", slug: "demo-alder", kind: "demo" as const };
    const { user, router } = await renderWithRouter(
      <WorkspaceNavigationContext
        value={{ workspaces: [...workspaces, demo], canAdminister: false }}
      >
        <AppShell current={{ kind: "workspace", workspace: alder }}>Workspace</AppShell>
      </WorkspaceNavigationContext>,
      "/app/alder/rounds",
    );
    await user.click(screen.getByRole("button", { name: "Alder Foundation: Switch workspace" }));
    const choices = within(screen.getByRole("dialog", { name: "Switch workspace" }));

    expect(choices.getByRole("link", { name: "Alder Foundation" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const demoChoice = choices.getByRole("link", { name: "Alder Foundation (demo)" });
    expect(demoChoice).not.toHaveAttribute("aria-current");
    expect(demoChoice).toHaveAttribute("href", "/app/demo-alder/rounds");

    await user.click(demoChoice);

    expect(router.state.location.pathname).toBe("/app/demo-alder/rounds");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses the team home without grant access and switches to grant work when available", async () => {
    const { user, router } = await renderWithRouter(
      <WorkspaceNavigationContext value={{ workspaces, canAdminister: false }}>
        <AppShell current={{ kind: "workspace", workspace: birch }}>Team</AppShell>
      </WorkspaceNavigationContext>,
      "/app/birch/settings/members",
    );

    expect(screen.getByRole("link", { name: "Merit home" })).toHaveAttribute(
      "href",
      "/app/birch/settings/members",
    );
    expect(screen.queryByRole("link", { name: "Funding rounds" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Applications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Activity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Contacts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workspace settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(screen.getByRole("button", { name: "Birch Foundation: Switch workspace" }));
    await user.click(screen.getByRole("link", { name: "Alder Foundation" }));

    expect(router.state.location.pathname).toBe("/app/alder/rounds");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("personal review navigation", () => {
  it("offers the person's workspaces from My reviews", async () => {
    const { user, router } = await renderWithRouter(
      <WorkspaceNavigationContext value={{ workspaces: [birch], canAdminister: false }}>
        <AppShell current={{ kind: "reviews" }}>Review work</AppShell>
      </WorkspaceNavigationContext>,
      "/reviews",
    );
    const sidebar = within(screen.getByRole("complementary"));

    expect(sidebar.getByRole("link", { name: "Merit home" })).toHaveAttribute("href", "/reviews");
    const navigation = within(sidebar.getByRole("navigation", { name: "Main navigation" }));
    expect(navigation.getAllByRole("link")).toHaveLength(1);
    expect(navigation.getByRole("link", { current: "page" })).toHaveAccessibleName("My reviews");
    expect(navigation.queryByText("Workspace", { exact: true })).not.toBeInTheDocument();

    await user.click(sidebar.getByRole("button", { name: "My reviews: Switch workspace" }));
    const choices = within(screen.getByRole("dialog", { name: "Switch workspace" }));
    expect(choices.getByRole("link", { name: "Birch Foundation" })).not.toHaveAttribute(
      "aria-current",
    );

    await user.click(choices.getByRole("link", { name: "Birch Foundation" }));

    expect(router.state.location.pathname).toBe("/app/birch/settings/members");
  });

  it("keeps a reviewer without workspaces static and adds administration for operators", async () => {
    await renderWithRouter(
      <WorkspaceNavigationContext value={{ workspaces: [], canAdminister: true }}>
        <AppShell current={{ kind: "reviews" }}>Review work</AppShell>
      </WorkspaceNavigationContext>,
      "/reviews/6bca8fde-b474-4ca7-a80b-3bc8af1cc979",
    );
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));

    expect(screen.queryByRole("button", { name: /Switch workspace/ })).not.toBeInTheDocument();
    expect(navigation.getByRole("link", { current: "page" })).toHaveAccessibleName("My reviews");
    expect(navigation.getByRole("link", { name: "Administration" })).toHaveAttribute(
      "href",
      "/admin/organizations",
    );
    expect(navigation.queryByRole("link", { name: "Workspace settings" })).not.toBeInTheDocument();
  });

  it("links to My reviews from real workspaces but not from a demo", async () => {
    const { unmount } = await renderWithRouter(
      <AppShell current={{ kind: "workspace", workspace: alder }}>Workspace</AppShell>,
      "/app/alder/rounds",
    );

    expect(screen.getByRole("link", { name: "My reviews" })).toHaveAttribute("href", "/reviews");
    unmount();

    const demo = { ...alder, slug: "demo-alder", kind: "demo" as const };
    await renderWithRouter(
      <QueryClientProvider client={createQueryClient()}>
        <AppShell current={{ kind: "workspace", workspace: demo }}>Workspace</AppShell>
      </QueryClientProvider>,
      "/app/demo-alder/rounds",
    );

    expect(screen.getByRole("link", { name: "Funding rounds" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "My reviews" })).not.toBeInTheDocument();
  });
});

describe("workspace navigation", () => {
  it("lists Activity after Applications for people who work on grants", async () => {
    await renderWithRouter(
      <AppShell current={{ kind: "workspace", workspace: alder }}>Workspace</AppShell>,
      "/app/alder/rounds",
    );
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    const names = navigation.getAllByRole("link").map((link) => link.textContent);

    expect(names.indexOf("Activity")).toBe(names.indexOf("Applications") + 1);
    expect(navigation.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      "/app/alder/activity",
    );
  });

  it.each([
    ["/app/alder/rounds", "Funding rounds"],
    ["/app/alder/rounds/community-grants-k7m2p9x4n6rt", "Funding rounds"],
    ["/app/alder/applications", "Applications"],
    ["/app/alder/applications/", "Applications"],
    ["/app/alder/applications/workshop-saturdays-b8q3w5j7c2df", "Applications"],
    ["/app/alder/activity", "Activity"],
    ["/app/alder/contacts", "Contacts"],
    ["/app/alder/settings/members", "Workspace settings"],
  ])("marks only %s's section as current", async (path, selected) => {
    await renderWithRouter(
      <AppShell current={{ kind: "workspace", workspace: alder }}>Workspace</AppShell>,
      path,
    );
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));

    expect(navigation.getByRole("link", { current: "page" })).toHaveAccessibleName(selected);
  });

  it("updates the current section while navigating within the same shell", async () => {
    const { user } = await renderWithRouter(
      <AppShell current={{ kind: "workspace", workspace: alder }}>Workspace</AppShell>,
      "/app/alder/rounds",
    );
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));

    for (const name of [
      "Applications",
      "Activity",
      "Contacts",
      "Workspace settings",
      "Funding rounds",
    ]) {
      await user.click(navigation.getByRole("link", { name }));

      expect(navigation.getByRole("link", { current: "page" })).toHaveAccessibleName(name);
    }
  });
});
