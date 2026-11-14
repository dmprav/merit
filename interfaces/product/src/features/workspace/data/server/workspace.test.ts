import { describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceServices } from "../../../../shared/request-context";
import { loadWorkspace } from "./workspace.server";

describe("workspace entry", () => {
  it.each(["signed_out", "unavailable"] as const)(
    "does not read a workspace when identity is %s",
    async (status) => {
      const services = {
        currentIdentity: async () => ({ status }),
        readWorkspace: vi.fn(),
      };

      expect(await loadWorkspace(services, "alder")).toEqual({ status });
      expect(services.readWorkspace).not.toHaveBeenCalled();
    },
  );

  it.each([
    { userId: "alder-manager", workspaceSlug: "alder" },
    { userId: "birch-manager", workspaceSlug: "birch" },
  ])(
    "loads $workspaceSlug access for $userId without grant services",
    async ({ userId, workspaceSlug }) => {
      const workspace = {
        id: workspaceSlug,
        slug: workspaceSlug,
        name: "Community Foundation",
        kind: "standard" as const,
        demoExpiresAt: null,
        role: "program_manager" as const,
        canWorkOnGrants: true,
        canViewTeam: true,
        administration: "owner" as const,
      };
      const services: Pick<WorkspaceServices, "currentIdentity" | "readWorkspace"> = {
        currentIdentity: async () => ({
          status: "authenticated",
          actor: { userId },
        }),
        readWorkspace: async (actor, slug) =>
          actor.userId === userId && slug === workspaceSlug ? workspace : null,
      };

      expect(await loadWorkspace(services, workspaceSlug)).toEqual({ status: "ok", workspace });
    },
  );

  it.each([
    { workspaceSlug: undefined, status: "no_workspace" },
    { workspaceSlug: "alder", status: "workspace_not_found" },
  ] as const)(
    "returns $status when no workspace is accessible at $workspaceSlug",
    async ({ workspaceSlug, status }) => {
      expect(
        await loadWorkspace(
          {
            currentIdentity: async () => ({
              status: "authenticated",
              actor: { userId: "new-user" },
            }),
            readWorkspace: async () => null,
          },
          workspaceSlug,
        ),
      ).toEqual({ status });
    },
  );
});
