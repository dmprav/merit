import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { useDrafts } from "@merit/drafts";

import { teamFixture } from "../../tests/team.fixtures";
import { useTeamEditors } from "./editors";

vi.mock("@merit/drafts", () => ({ useDrafts: vi.fn() }));

const update = vi.fn<ReturnType<typeof useDrafts>["update"]>();
let ready = false;
beforeEach(() => {
  ready = false;
  update.mockClear();
  vi.mocked(useDrafts).mockImplementation(() => ({
    drafts: {},
    ready,
    status: ready ? "unavailable" : "restoring",
    storageUnavailable: ready,
    update,
  }));
});

const show = () =>
  renderHook(
    ({ scope }) =>
      useTeamEditors({
        team: teamFixture,
        draftScope: scope,
        onInvite: vi.fn(),
        onChangeMember: vi.fn(),
        onClose: vi.fn(),
      }),
    { initialProps: { scope: "account" } },
  );

it("initializes a requested invitation only after recovery finishes, including failed recovery", () => {
  const { result, rerender } = show();
  act(() => result.current.openInvitation());
  expect(update).not.toHaveBeenCalled();
  ready = true;
  rerender({ scope: "account" });
  expect(update).toHaveBeenCalledOnce();
  expect(update.mock.calls[0]![0]({})).toMatchObject({
    alder: {
      email: "",
      administration: "none",
      role: "program_manager",
    },
  });
  expect(result.current.storageError).toBe(true);
});

it("cancels a pending invitation without clearing unseen drafts", () => {
  const { result, rerender } = show();
  act(() => result.current.openInvitation());
  act(() => result.current.closeInvitation());
  ready = true;
  rerender({ scope: "account" });
  expect(update).not.toHaveBeenCalled();
});

it("does not initialize a pending invitation for a different account", () => {
  const { result, rerender } = show();
  act(() => result.current.openInvitation());
  ready = true;
  rerender({ scope: "different-account" });
  expect(update).not.toHaveBeenCalled();
});
