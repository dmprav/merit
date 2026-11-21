import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { teamFixture } from "../../tests/team.fixtures";
import type { MutationResult, TeamData } from "../contracts/team";
import { en, OrganizationMessagesProvider } from "../messages";
import { useTeam } from "./team";

const teamData = (overrides: Partial<TeamData> = {}): TeamData => ({
  team: teamFixture,
  fetching: false,
  invite: vi.fn(),
  changeMember: vi.fn(),
  removeMember: vi.fn(),
  revoke: vi.fn(),
  resend: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
  refreshAfterSave: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const showTeam = (data: TeamData) => {
  const committed = vi.fn();
  const { result } = renderHook(() => useTeam({ data, onClose: vi.fn(), onCommitted: committed }), {
    wrapper: OrganizationMessagesProvider,
  });

  return { result, committed };
};

afterEach(() => vi.useRealTimers());

it("reports a committed change separately from an injected refresh failure without repeating the write", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const data = teamData({
    resend: vi.fn().mockResolvedValue({ status: "ok", value: null }),
    refreshAfterSave: vi.fn().mockRejectedValue(new Error("Offline")),
  });
  const { result, committed } = showTeam(data);
  await act(async () => {
    expect(await result.current.resend(teamFixture.invitations[0]!)).toBeNull();
  });

  expect(committed).toHaveBeenCalledOnce();
  expect(result.current.error).toBeNull();
  // The failed read retries quietly before it is reported.
  expect(result.current.refreshError).toBeNull();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });

  expect(result.current.refreshError).toBe("saved");

  vi.mocked(data.refreshAfterSave).mockResolvedValueOnce(undefined);
  await act(() => result.current.refresh());

  expect(result.current.refreshError).toBeNull();
  expect(data.resend).toHaveBeenCalledOnce();
});

type Rejection = Exclude<MutationResult, { status: "ok" }>["status"];

it.each([
  { operation: "remove", status: "owner_protected", stale: false },
  { operation: "remove", status: "self_change", stale: false },
  { operation: "remove", status: "conflict", stale: true },
  { operation: "remove", status: "forbidden", stale: true },
  { operation: "remove", status: "not_found", stale: true },
  { operation: "resend", status: "invitation_cooldown", stale: false },
  { operation: "resend", status: "invitation_hourly_limit", stale: false },
  { operation: "resend", status: "invitation_daily_limit", stale: false },
] as const satisfies { operation: "remove" | "resend"; status: Rejection; stale: boolean }[])(
  "explains the $status rejection of $operation without announcing success (stale: $stale)",
  async ({ operation, status, stale }) => {
    const rejected = vi.fn().mockResolvedValue({ status });
    const { result, committed } = showTeam(
      teamData(operation === "remove" ? { removeMember: rejected } : { resend: rejected }),
    );

    let problem: string | null = null;
    await act(async () => {
      problem =
        operation === "remove"
          ? await result.current.remove(teamFixture.members[1]!)
          : await result.current.resend(teamFixture.invitations[0]!);
    });

    expect(problem).toBe(en.errors[status]);
    expect(result.current.error).toBe(status);
    expect(result.current.stale).toBe(stale);
    expect(result.current.refreshError).toBeNull();
    expect(committed).not.toHaveBeenCalled();
  },
);
