import "../../tests/local-request-cookies";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { WebMessagesProvider } from "./messages";
import { WorkspaceAccount } from "./workspace-account";

const clerk = vi.hoisted(() => ({
  signOut: vi.fn(async (navigate: () => void) => navigate()),
}));
vi.mock("@clerk/tanstack-react-start", () => ({
  useClerk: () => clerk,
  useUser: () => ({ isLoaded: true, user: { fullName: "Robin Ellis" } }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  document.cookie = "merit-local-person=; Path=/; Max-Age=0";
});

describe("WorkspaceAccount", () => {
  it("reads the dev-only local persona cookie when MERIT_LOCAL_WORKSPACE is enabled", () => {
    vi.stubEnv("MERIT_LOCAL_WORKSPACE", "true");
    document.cookie = "merit-local-person=operator; Path=/";

    render(<WorkspaceAccount />, { wrapper: WebMessagesProvider });
    expect(screen.getByText("Merit operator")).toBeVisible();
  });

  it("falls back to default local persona when cookie is absent", () => {
    vi.stubEnv("MERIT_LOCAL_WORKSPACE", "true");

    render(<WorkspaceAccount />, { wrapper: WebMessagesProvider });
    expect(screen.getByText("Dana Reed")).toBeVisible();
  });

  it.each(["constructor", "toString", "__proto__"])(
    "falls back to default local persona when cookie is malformed (%s)",
    (cookieValue) => {
      vi.stubEnv("MERIT_LOCAL_WORKSPACE", "true");
      document.cookie = `merit-local-person=${cookieValue}; Path=/`;

      render(<WorkspaceAccount />, { wrapper: WebMessagesProvider });
      expect(screen.getByText("Dana Reed")).toBeVisible();
    },
  );

  it("does not render local persona without MERIT_LOCAL_WORKSPACE outside demo workspaces", () => {
    vi.stubEnv("MERIT_LOCAL_WORKSPACE", "");
    document.cookie = "merit-local-person=operator; Path=/";

    const { container } = render(<WorkspaceAccount />, { wrapper: WebMessagesProvider });
    expect(container).toBeEmptyDOMElement();
  });

  it("signs out with a fresh load of the public site", async () => {
    vi.stubEnv("MERIT_LOCAL_WORKSPACE", "");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const user = userEvent.setup();

    render(<WorkspaceAccount />, { wrapper: WebMessagesProvider });
    await user.click(screen.getByRole("button", { name: "Robin Ellis: Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });
});
