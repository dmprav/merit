import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AdminAccount } from "./account";
import { AdminMessages } from "./messages";

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

describe("AdminAccount", () => {
  it.each([
    ["operator", "Merit operator"],
    ["reviewer", "Robin Ellis"],
  ])("displays the selected %s in a local workspace", (person, name) => {
    vi.stubEnv("MERIT_LOCAL_WORKSPACE", "true");
    document.cookie = `merit-local-person=${person}; Path=/`;

    render(<AdminAccount />, { wrapper: AdminMessages });
    expect(screen.getByText(name)).toBeVisible();
  });

  it.each(["constructor", "toString", "__proto__"])(
    "falls back to default local persona when cookie is malformed (%s)",
    (cookieValue) => {
      vi.stubEnv("MERIT_LOCAL_WORKSPACE", "true");
      document.cookie = `merit-local-person=${cookieValue}; Path=/`;

      render(<AdminAccount />, { wrapper: AdminMessages });
      expect(screen.getByText("Dana Reed")).toBeVisible();
    },
  );

  it("renders nothing when MERIT_LOCAL_WORKSPACE and Clerk are disabled", () => {
    vi.stubEnv("MERIT_LOCAL_WORKSPACE", "");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    document.cookie = "merit-local-person=operator; Path=/";

    const { container } = render(<AdminAccount />, { wrapper: AdminMessages });
    expect(container).toBeEmptyDOMElement();
  });

  it("signs out with a fresh load of the public site", async () => {
    vi.stubEnv("MERIT_LOCAL_WORKSPACE", "");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const user = userEvent.setup();

    render(<AdminAccount />, { wrapper: AdminMessages });
    await user.click(screen.getByRole("button", { name: "Robin Ellis: Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });
});
