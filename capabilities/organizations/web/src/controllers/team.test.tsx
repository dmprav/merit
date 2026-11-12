import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { teamFixture } from "../../tests/team.fixtures";
import type { TeamData } from "../contracts/team";
import { OrganizationMessagesProvider } from "../messages";
import { useTeam } from "./team";

it("reports a committed change separately from an injected refresh failure without repeating the write", async () => {
  const data: TeamData = {
    team: teamFixture,
    fetching: false,
    invite: vi.fn(),
    changeMember: vi.fn(),
    removeMember: vi.fn(),
    revoke: vi.fn(),
    resend: vi.fn().mockResolvedValue({ status: "ok", value: null }),
    refresh: vi.fn().mockResolvedValue(undefined),
    refreshAfterSave: vi.fn().mockRejectedValue(new Error("Offline")),
  };
  const committed = vi.fn();
  const { result } = renderHook(() => useTeam({ data, onClose: vi.fn(), onCommitted: committed }), {
    wrapper: OrganizationMessagesProvider,
  });
  await act(async () => {
    expect(await result.current.resend(teamFixture.invitations[0]!)).toBeNull();
  });

  expect(committed).toHaveBeenCalledOnce();
  expect(result.current.error).toBeNull();
  expect(result.current.refreshFailed).toBe(true);

  await act(() => result.current.refresh());

  expect(result.current.refreshFailed).toBe(false);
  expect(data.resend).toHaveBeenCalledOnce();
});
