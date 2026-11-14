import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AdminAccount } from "./account";
import { AdminMessages } from "./messages";

afterEach(() => {
  vi.unstubAllEnvs();
  document.cookie = "merit-local-person=; Path=/; Max-Age=0";
});

describe("AdminAccount", () => {
  it("reads the dev-only local persona cookie when MERIT_LOCAL_WORKSPACE is enabled", () => {
    vi.stubEnv("MERIT_LOCAL_WORKSPACE", "true");
    document.cookie = "merit-local-person=operator; Path=/";

    render(<AdminAccount />, { wrapper: AdminMessages });
    expect(screen.getByText("Merit operator")).toBeVisible();
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
});
