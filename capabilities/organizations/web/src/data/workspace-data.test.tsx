import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import { createQueryClient, privateKey } from "@merit/query";

import { teamFixture } from "../../tests/team.fixtures";
import type { TeamTransport } from "../contracts/team";
import { useWorkspaceTeam } from "./workspace-data";

const transport = (): TeamTransport => ({
  read: vi.fn<TeamTransport["read"]>().mockResolvedValue({ status: "ok", value: teamFixture }),
  invite: vi.fn<TeamTransport["invite"]>(),
  changeMember: vi.fn<TeamTransport["changeMember"]>(),
  removeMember: vi.fn<TeamTransport["removeMember"]>(),
  resend: vi.fn<TeamTransport["resend"]>(),
  revoke: vi.fn<TeamTransport["revoke"]>(),
});

it("revalidates access when the team refresh fails and retains the last team", async () => {
  const client = createQueryClient();
  const operations = transport();
  vi.mocked(operations.read).mockRejectedValue(new Error("Offline"));
  const revalidateAccess = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const { result } = renderHook(() => useWorkspaceTeam(teamFixture, operations, revalidateAccess), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });

  await act(async () => {
    await expect(result.current.refresh()).rejects.toThrow("Team unavailable");
  });

  expect(revalidateAccess).toHaveBeenCalledOnce();
  expect(result.current.team).toEqual(teamFixture);
});

it("invalidates private data after a saved membership change before revalidating access", async () => {
  const client = createQueryClient();
  const privateRecord = [...privateKey, "workspace", "alder", "rounds"];
  const publicRecord = ["public", "guide"];
  client.setQueryData(privateRecord, { title: "A round" });
  client.setQueryData(publicRecord, { title: "A guide" });
  const revalidateAccess = vi.fn<() => Promise<void>>().mockImplementation(async () => {
    expect(client.getQueryState(privateRecord)?.isInvalidated).toBe(true);
  });
  const { result } = renderHook(
    () => useWorkspaceTeam(teamFixture, transport(), revalidateAccess),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );

  await act(() => result.current.refreshAfterSave());

  expect(revalidateAccess).toHaveBeenCalledOnce();
  expect(client.getQueryState(publicRecord)?.isInvalidated).toBe(false);
});
