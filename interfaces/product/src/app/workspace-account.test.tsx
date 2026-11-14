import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { WebMessagesProvider } from "./messages";
import { WorkspaceAccount } from "./workspace-account";

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("does not render local persona without MERIT_LOCAL_WORKSPACE outside demo workspaces", () => {
    vi.stubEnv("MERIT_LOCAL_WORKSPACE", "");
    document.cookie = "merit-local-person=operator; Path=/";

    const { container } = render(<WorkspaceAccount />, { wrapper: WebMessagesProvider });
    expect(container).toBeEmptyDOMElement();
  });
});
