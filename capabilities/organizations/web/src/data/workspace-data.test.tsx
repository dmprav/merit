import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import { createQueryClient, privateKey } from "@merit/query";
import { usePagedContent } from "@merit/query/pages";

import { teamFixture } from "../../tests/team.fixtures";
import type { TeamData, TeamTransport } from "../contracts/team";
import { useWorkspaceTeam } from "./workspace-data";

const transport = (): TeamTransport => ({
  read: vi.fn<TeamTransport["read"]>().mockResolvedValue({ status: "ok", value: teamFixture }),
  invite: vi.fn<TeamTransport["invite"]>(),
  changeMember: vi.fn<TeamTransport["changeMember"]>(),
  removeMember: vi.fn<TeamTransport["removeMember"]>(),
  resend: vi.fn<TeamTransport["resend"]>(),
  revoke: vi.fn<TeamTransport["revoke"]>(),
});

const historyEntry = (eventId: string) => ({
  eventId,
  action: "team_invitation.issued",
  actor: "Dana Reed",
  provenance: null,
  recordedAt: "2026-11-13T10:00:00Z",
  details: null,
});

const setupHistory = () => {
  const client = createQueryClient();
  const read = vi.fn<NonNullable<TeamData["historySource"]>["read"]>();
  const source = { queryKey: [...privateKey, "workspace", "alder", "team", "history"], read };
  const operations = { ...transport(), history: () => source };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const team = renderHook(() => useWorkspaceTeam(teamFixture, operations, async () => {}), {
    wrapper,
  });
  return { client, read, source, team, wrapper };
};

it.each(["refresh", "refreshAfterSave"] as const)(
  "%s refreshes all open history pages using their current cursors",
  async (operation) => {
    const { read, source, team, wrapper } = setupHistory();
    read
      .mockResolvedValueOnce({ entries: [historyEntry("recent")], nextCursor: "older" })
      .mockResolvedValueOnce({ entries: [historyEntry("old")], nextCursor: null });
    const history = renderHook(() => usePagedContent(source), { wrapper });
    await waitFor(() => expect(history.result.current.loaded).toBe(true));
    await act(() => history.result.current.more());
    read
      .mockResolvedValueOnce({ entries: [historyEntry("saved")], nextCursor: "recent" })
      .mockResolvedValueOnce({ entries: [historyEntry("recent")], nextCursor: "older" });

    await act(() => team.result.current[operation]());

    await waitFor(() =>
      expect(history.result.current.entries.map((entry) => entry.eventId)).toEqual([
        "saved",
        "recent",
      ]),
    );
    expect(history.result.current.hasMore).toBe(true);
    expect(read.mock.calls.map(([after]) => after)).toEqual([
      undefined,
      "older",
      undefined,
      "recent",
    ]);
  },
);

it("leaves closed history stale without fetching until it is opened", async () => {
  const { client, read, source, team, wrapper } = setupHistory();
  client.setQueryData(source.queryKey, {
    pages: [{ entries: [historyEntry("old")], nextCursor: null }],
    pageParams: [undefined],
  });
  read.mockResolvedValue({ entries: [historyEntry("saved")], nextCursor: null });

  await act(() => team.result.current.refreshAfterSave());

  expect(read).not.toHaveBeenCalled();
  expect(client.getQueryState(source.queryKey)?.isInvalidated).toBe(true);
  const history = renderHook(() => usePagedContent(source), { wrapper });
  await waitFor(() =>
    expect(history.result.current.entries.map((entry) => entry.eventId)).toEqual(["saved"]),
  );
  expect(read).toHaveBeenCalledOnce();
});

it("clears open history when its refresh denies access", async () => {
  const { read, source, team, wrapper } = setupHistory();
  read.mockResolvedValueOnce({ entries: [historyEntry("old")], nextCursor: null });
  const history = renderHook(() => usePagedContent(source), { wrapper });
  await waitFor(() => expect(history.result.current.loaded).toBe(true));
  read.mockResolvedValueOnce(null);

  await act(() => team.result.current.refresh());

  await waitFor(() => expect(history.result.current.denied).toBe(true));
  expect(history.result.current.entries).toEqual([]);
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
