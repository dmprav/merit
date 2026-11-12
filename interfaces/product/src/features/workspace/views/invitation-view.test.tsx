import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { WebMessagesProvider } from "../../../app/messages";
import { InvitationView } from "./invitation-view";

type ViewProps = ComponentProps<typeof InvitationView>;

const invitation = {
  status: "ok" as const,
  value: {
    organization: { name: "Alder Foundation" },
    administration: "owner" as const,
    role: "program_manager" as const,
    accepted: false,
  },
};

const show = async (ui: ReactNode) => {
  const root = createRootRoute({ component: () => ui });
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/app/sign-in",
    validateSearch: (search: Record<string, unknown>) => ({
      returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
    }),
    component: () => null,
  });
  const workspaces = createRoute({
    getParentRoute: () => root,
    path: "/app",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([signIn, workspaces]),
    history: createMemoryHistory({ initialEntries: ["/invitations/preview-token"] }),
    defaultPendingMinMs: 0,
  });
  await router.load();
  return {
    ...render(<RouterProvider router={router} />, { wrapper: WebMessagesProvider }),
    user: userEvent.setup(),
  };
};

const view = (props: Partial<ViewProps> = {}) =>
  show(<InvitationView result={invitation} token="preview-token" onAccept={vi.fn()} {...props} />);

const destination = (name: string) =>
  new URL(screen.getByRole("link", { name }).getAttribute("href")!, "http://localhost");

it("shows an owner's membership and grant access before acceptance", async () => {
  await view();

  expect(screen.getByRole("heading", { name: "Alder Foundation" })).toBeVisible();
  expect(screen.getByText("Organization owner", { exact: true })).toBeVisible();
  expect(screen.getByText("Manage membership and appoint administrators.")).toBeVisible();
  expect(screen.getByText("Program manager", { exact: true })).toBeVisible();
  expect(screen.getByText("Access to the organization’s grant work.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
});

it.each([
  [
    "administrator",
    "member",
    "Organization administrator",
    "Manage membership and grant access.",
    "No grant-work access",
    "This invitation does not grant access to grant work.",
  ],
  [
    "none",
    "program_manager",
    "Organization member",
    "No membership-management responsibilities.",
    "Program manager",
    "Access to the organization’s grant work.",
  ],
] as const)(
  "explains %s administration with %s grant access",
  async (administration, role, responsibility, description, access, accessDescription) => {
    await view({
      result: { status: "ok", value: { ...invitation.value, administration, role } },
    });

    expect(screen.getByText(responsibility, { exact: true })).toBeVisible();
    expect(screen.getByText(description)).toBeVisible();
    expect(screen.getByText(access, { exact: true })).toBeVisible();
    expect(screen.getByText(accessDescription)).toBeVisible();
  },
);

it("offers the workspace after the invitation was already accepted", async () => {
  const onAccept = vi.fn();
  const { user } = await view({
    result: { status: "ok", value: { ...invitation.value, accepted: true } },
    onAccept,
  });

  expect(screen.getByText("You have already accepted this invitation.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Open workspace" }));
  expect(onAccept).toHaveBeenCalledOnce();
});

it("ignores further clicks while acceptance is pending", async () => {
  const onAccept = vi.fn();
  const { user } = await view({ pending: true, onAccept });

  const joining = screen.getByRole("button", { name: "Joining…" });
  expect(joining).toHaveAttribute("aria-disabled", "true");
  await user.click(joining);
  expect(onAccept).not.toHaveBeenCalled();
});

it("keeps the invitation available after acceptance fails and accepts it on retry", async () => {
  const Harness = () => {
    const [error, setError] = useState("The invitation could not be accepted. Please try again.");
    const [accepted, setAccepted] = useState(false);
    return (
      <InvitationView
        result={{ status: "ok", value: { ...invitation.value, accepted } }}
        token="preview-token"
        error={error}
        onAccept={() => {
          setError("");
          setAccepted(true);
        }}
      />
    );
  };

  const { user } = await show(<Harness />);

  expect(screen.getByRole("alert")).toHaveTextContent("Please try again");
  expect(screen.getByRole("heading", { name: "Alder Foundation" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Accept invitation" }));

  expect(screen.getByText("You have already accepted this invitation.")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open workspace" })).toBeEnabled();
});

it.each([
  ["signed_out", "Sign in to review this invitation", "Sign in", "/app/sign-in"],
  ["wrong_account", "Use the invited account", "Switch account", "/app/sign-in"],
  ["expired", "Invitation expired", "My workspaces", "/app"],
  ["revoked", "Invitation no longer active", "My workspaces", "/app"],
] as const)("sends a %s invitation to %s", async (status, heading, action, path) => {
  await view({ result: { status } });

  expect(screen.getByRole("heading", { name: heading })).toBeVisible();
  expect(destination(action).pathname).toBe(path);
  if (status === "signed_out" || status === "wrong_account") {
    expect(destination(action).searchParams.get("returnTo")).toBe("/invitations/preview-token");
  }
  expect(screen.queryByRole("button", { name: "Accept invitation" })).not.toBeInTheDocument();
});

it("offers another read when the invitation cannot be loaded", async () => {
  await view({ result: { status: "unavailable" } });

  expect(screen.getByRole("heading", { name: "Invitation unavailable" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).not.toBeInTheDocument();
});
