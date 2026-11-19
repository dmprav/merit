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
    conflicts: new Set(),
    update,
    resolveConflict: vi.fn(),
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

it("gates invitation conflict checks on revoking issued invitations and supports keepDraft and loadLatest", () => {
  const member = teamFixture.members[1]!;
  let drafts: Record<string, unknown> = {
    [`${teamFixture.organization.slug}/${member.userId}`]: {
      value: { administration: member.administration, role: "reviewer" },
      expectedMembershipId: member.membershipId,
      expectedVersion: member.version,
      expectedInvitationIds: ["old-invitation"],
    },
  };
  ready = true;
  vi.mocked(useDrafts).mockImplementation(() => ({
    drafts,
    ready: true,
    status: "saved",
    storageUnavailable: false,
    conflicts: new Set(),
    update: (updater) => {
      drafts = updater(drafts);
      update(updater);
    },
    resolveConflict: vi.fn(),
  }));

  const { result, rerender } = show();
  expect(result.current.memberEditor(member).conflict).toBe(false);

  drafts = {
    [`${teamFixture.organization.slug}/${member.userId}`]: {
      value: { administration: "none", role: "reviewer" },
      expectedMembershipId: member.membershipId,
      expectedVersion: member.version,
      expectedInvitationIds: ["old-invitation"],
    },
  };
  rerender({ scope: "account" });
  expect(result.current.memberEditor(member).conflict).toBe(true);

  act(() => result.current.memberEditor(member).onKeepDraft());
  rerender({ scope: "account" });
  expect(result.current.memberEditor(member).conflict).toBe(false);

  drafts = {
    [`${teamFixture.organization.slug}/${member.userId}`]: {
      value: { administration: "none", role: "reviewer" },
      expectedMembershipId: member.membershipId,
      expectedVersion: member.version - 1,
      expectedInvitationIds: [],
    },
  };
  rerender({ scope: "account" });
  expect(result.current.memberEditor(member).conflict).toBe(true);

  act(() => result.current.memberEditor(member).onLoadLatest());
  rerender({ scope: "account" });
  expect(result.current.memberEditor(member).conflict).toBe(false);
  expect(result.current.memberEditor(member).draftReset).toBe(1);
});
