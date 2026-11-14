import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { readDraftStorage, seedDraftStorage } from "@merit/drafts/testing";
import { applicationView } from "@merit/grantmaking/api";
import { makeApplication } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";

import type { IntakeData } from "../../contracts/intake";
import { createIntakeData } from "../../data/intake/workspace-data";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { GrantmakingDrafts } from "../../testing/providers";
import { intakeSnapshot } from "./intake-state";
import { useApplicationIntake } from "./use-application-intake";

it.each(["delete", "discard_revision"] as const)(
  "keeps the original %s confirmation revision through refresh and retry until reopened",
  async (action) => {
    const application = applicationView(makeApplication());
    const data: IntakeData = {
      draftKey: "application",
      workspaceSlug: "alder",
      publicId: application.id,
      state: { revision: 1, history: [], workingRevision: null },
      save: vi
        .fn<IntakeData["save"]>()
        .mockImplementation(async (_, revision) =>
          revision === 2 ? { status: "ok", revision: 3 } : { status: "conflict" },
        ),
      refresh: vi.fn().mockResolvedValue(undefined),
      refreshCurrent: vi.fn().mockResolvedValue(undefined),
    };
    const onDeleted = vi.fn().mockResolvedValue(undefined);
    const client = createQueryClient();
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useApplicationIntake({
          application,
          data: { ...data, state: { ...data.state, revision } },
          onDeleted,
        }),
      {
        initialProps: { revision: 1 },
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>
            <GrantmakingMessagesProvider>
              <GrantmakingDrafts>{children}</GrantmakingDrafts>
            </GrantmakingMessagesProvider>
          </QueryClientProvider>
        ),
      },
    );

    act(() => result.current.setConfirmation(action));
    rerender({ revision: 2 });
    await act(() => result.current.confirm());
    expect(data.save).toHaveBeenLastCalledWith({ action }, 1);
    expect(result.current.error).toEqual({ status: "conflict" });
    expect(result.current.confirmation).toBe(action);
    expect(onDeleted).not.toHaveBeenCalled();

    await act(() => result.current.confirm());
    expect(data.save).toHaveBeenLastCalledWith({ action }, 1);
    expect(result.current.saved).toBe(0);

    act(() => result.current.setConfirmation(null));
    act(() => result.current.setConfirmation(action));
    expect(result.current.error).toBeNull();
    await act(() => result.current.confirm());
    expect(data.save).toHaveBeenLastCalledWith({ action }, 2);
    expect(result.current.confirmation).toBeNull();
    expect(result.current.saved).toBe(1);
    expect(onDeleted).toHaveBeenCalledTimes(action === "delete" ? 1 : 0);
  },
);

it("recovers and migrates legacy unnamespaced intake drafts to the workspace-scoped key", async () => {
  const application = applicationView(makeApplication());
  const baseline = intakeSnapshot(application, null);
  await seedDraftStorage("dana", "applications", {
    [`${application.id}:title`]: {
      section: "title",
      baseline,
      revision: 1,
      value: { title: "Recovered legacy title" },
    },
    [`${application.id}:reason`]: {
      section: "reason",
      baseline,
      revision: 1,
      value: { reason: "Legacy reason note" },
    },
  });

  const client = createQueryClient();
  const data = createIntakeData(
    client,
    {
      workspaceSlug: "alder",
      publicId: application.id,
      state: { revision: 1, history: [], workingRevision: null },
    },
    {
      applicationScope: ["app"],
      grantWorkScope: ["grant"],
      editApplication: vi.fn(),
      selectContact: vi.fn(),
    },
  );

  const { result } = renderHook(
    () =>
      useApplicationIntake({
        application,
        data,
        onDeleted: vi.fn().mockResolvedValue(undefined),
      }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          <GrantmakingMessagesProvider>
            <GrantmakingDrafts storageScope="dana">{children}</GrantmakingDrafts>
          </GrantmakingMessagesProvider>
        </QueryClientProvider>
      ),
    },
  );

  await waitFor(() => expect(result.current).not.toBeNull());
  expect(result.current.changed("title")).toBe(true);
  expect(result.current.editor.reason).toBe("Legacy reason note");

  act(() => result.current.open("title"));
  expect(result.current.editor.draft).toMatchObject({
    section: "title",
    value: { title: "Recovered legacy title" },
  });

  await waitFor(async () => {
    const stored = await readDraftStorage("dana", "applications");
    expect(stored).toHaveProperty(`alder/${application.id}:title`);
    expect(stored).toHaveProperty(`alder/${application.id}:reason`);
    expect(stored).not.toHaveProperty(`${application.id}:title`);
    expect(stored).not.toHaveProperty(`${application.id}:reason`);
  });
});
