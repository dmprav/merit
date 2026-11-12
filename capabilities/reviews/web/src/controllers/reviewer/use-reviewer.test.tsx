import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import type { ReviewerPage } from "@merit/reviews/api";

import type { ReviewerData } from "../../contracts/reviewer";
import { useReviewer } from "./use-reviewer";

const setup = (adjust?: (page: ReviewerPage) => void) => {
  const page: ReviewerPage = {
    assignment: {
      id: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      revision: 1,
      status: "accepted",
      reviewer: "Sam",
      hasSubmitted: false,
      email: "sam@example.test",
      applicationTitle: "Community review",
      applicant: "Community group",
      organization: "Alder",
      dueDate: null,
      managerName: "Dana",
      managerEmail: "dana@example.test",
      applicationVersion: 1,
      criteriaVersion: 1,
      basisComparison: {
        applicationVersion: "same",
        criteriaVersion: "same",
        criteriaContent: "same",
      },
      materialChanged: false,
      criteriaChanged: false,
      conflict: "",
      delivery: "sent",
      notification: null,
      expiresAt: "2099-01-01T00:00:00Z",
    },
    material: null,
    criteria: [],
    assessment: null,
    draft: {
      revision: 0,
      content: {
        position: "Fund",
        amount: "40",
        reasoning: "Original",
        observations: [],
        note: "",
      },
    },
  };
  adjust?.(page);
  const data = {
    read: vi.fn<ReviewerData["read"]>(),
    save: vi.fn<ReviewerData["save"]>(),
    submit: vi.fn<ReviewerData["submit"]>(),
    respond: vi.fn<ReviewerData["respond"]>(),
  };
  data.save.mockResolvedValue({ status: "ok", value: { revision: 1 } });
  data.read.mockResolvedValue({ status: "ok", value: page });
  return { ...renderHook(() => useReviewer(page, data)), data, page };
};

it("autosaves and retains newer typing while an earlier save completes", async () => {
  const { result, data } = setup();
  let resolve!: (result: Awaited<ReturnType<ReviewerData["save"]>>) => void;
  data.save.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  act(() => result.current.update({ ...result.current.draft!, reasoning: "First edit" }));
  await waitFor(() => expect(data.save).toHaveBeenCalledOnce());
  act(() => result.current.update({ ...result.current.draft!, reasoning: "Newer typing" }));
  await act(async () => resolve({ status: "ok", value: { revision: 1 } }));
  expect(result.current.draft?.reasoning).toBe("Newer typing");
  expect(result.current.dirty).toBe(true);
  await act(() => result.current.save());
  expect(data.save.mock.lastCall?.[0]).toMatchObject({
    expectedDraftRevision: 1,
    draft: { reasoning: "Newer typing" },
  });
  expect(result.current.dirty).toBe(false);
});

it("keeps local and remote drafts until the reviewer explicitly reconciles", async () => {
  const { result, data, page } = setup();
  act(() => result.current.update({ ...result.current.draft!, reasoning: "Mine" }));
  data.save.mockResolvedValueOnce({ status: "conflict" });
  data.read.mockResolvedValue({
    status: "ok",
    value: {
      ...page,
      draft: { revision: 2, content: { ...page.draft!.content, reasoning: "Other device" } },
    },
  });
  await act(() => result.current.save());
  expect(result.current.draft?.reasoning).toBe("Mine");
  expect(result.current.conflict?.draft?.content.reasoning).toBe("Other device");
  act(() => result.current.reconcile(false));
  await act(() => result.current.save());
  expect(data.save.mock.lastCall?.[0]).toMatchObject({
    expectedDraftRevision: 2,
    draft: { reasoning: "Mine" },
  });
});

it("does not submit a stale snapshot if the reviewer types during the final save", async () => {
  const { result, data } = setup();
  let resolve!: (result: Awaited<ReturnType<ReviewerData["save"]>>) => void;
  data.save.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  act(() => result.current.update({ ...result.current.draft!, reasoning: "Ready" }));
  let submission!: Promise<unknown>;
  act(() => {
    submission = result.current.submit();
  });
  act(() => result.current.update({ ...result.current.draft!, reasoning: "One more detail" }));
  await act(async () => {
    resolve({ status: "ok", value: { revision: 1 } });
    await submission;
  });
  expect(data.submit).not.toHaveBeenCalled();
  expect(result.current.draft?.reasoning).toBe("One more detail");
});

it("retries a lost submission response with the same receipt and only reloads after confirmation", async () => {
  const { result, data, page } = setup();
  data.submit
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValue({ status: "ok", value: { revision: 1 } });
  await act(() => result.current.submit());
  const first = data.submit.mock.calls[0]![0];
  expect(result.current.submissionPending).toBe(true);
  data.read.mockRejectedValueOnce(new Error("Read offline"));
  await act(() => result.current.submit());
  expect(data.submit.mock.lastCall?.[0]).toEqual(first);
  expect(result.current.error).toBe("submissionSaved");
  data.read.mockResolvedValue({
    status: "ok",
    value: {
      ...page,
      assignment: { ...page.assignment, status: "submitted" },
      draft: { ...page.draft!, revision: 1 },
    },
  });
  await act(() => result.current.submit());
  expect(data.submit).toHaveBeenCalledTimes(2);
  expect(result.current.page.assignment.status).toBe("submitted");
  expect(result.current.submissionPending).toBe(false);
});

it("preserves unsaved text when access ends", async () => {
  const { result, data, page } = setup();
  act(() => result.current.update({ ...result.current.draft!, reasoning: "Keep this writing" }));
  data.save.mockResolvedValue({ status: "not_found" });
  await act(() => result.current.save());
  expect(result.current.error).toBe("accessLost");
  data.read.mockResolvedValue({
    status: "ok",
    value: { ...page, assignment: { ...page.assignment, status: "cancelled" }, draft: null },
  });
  await act(() => result.current.refresh());
  expect(result.current.canWrite).toBe(false);
  expect(result.current.draft?.reasoning).toBe("Keep this writing");
});

it("retries acceptance with the original command after its follow-up read fails", async () => {
  const { result, data, page } = setup();
  data.respond.mockResolvedValue({ status: "ok", value: page.assignment });
  data.read.mockRejectedValueOnce(new Error("Offline"));
  await act(() => result.current.respond("accept", ""));
  const first = data.respond.mock.calls[0]![0];
  await act(() => result.current.respond("decline", ""));
  expect(data.respond).toHaveBeenCalledOnce();
  expect(result.current.error).toBe("stale");
  await act(() => result.current.respond("accept", ""));
  expect(data.respond.mock.lastCall?.[0]).toEqual(first);
});

it("keeps an incomplete judgment local and reports each problem beside its field", async () => {
  const { result, data } = setup();
  act(() => result.current.update({ ...result.current.draft!, position: null, reasoning: " " }));
  expect(result.current.problems).toEqual([]);
  await act(async () => {
    expect(await result.current.submit()).toBe("invalid");
  });
  expect(data.submit).not.toHaveBeenCalled();
  expect(result.current.problems).toEqual(["position", "reasoning"]);
  act(() => result.current.update({ ...result.current.draft!, position: "Defer", amount: null }));
  expect(result.current.problems).toEqual(["reasoning"]);
});

it("opens submitted work for reading, then closes, resumes, or discards an amendment", async () => {
  const { result } = setup((page) => {
    const submitted = { ...page.draft!.content };
    page.assignment.status = "submitted";
    page.assessment = {
      id: "assessment",
      contactId: "sam",
      requestId: page.assignment.requestId,
      previousId: null,
      reviewer: "Sam",
      authorUserId: "sam",
      versions: [
        {
          content: { ...submitted, date: null, applicationVersion: 1, criteriaVersion: 1 },
          criteria: [],
          recorder: null,
          note: "",
        },
      ],
    } as unknown as ReviewerPage["assessment"];
    page.draft!.content.reasoning = "Unfinished amendment";
  });
  expect(result.current.amending).toBe(false);
  expect(result.current.amendmentDraft).toBe(true);

  act(() => result.current.startAmendment());
  expect(result.current.amending).toBe(true);
  act(() => result.current.closeAmendment());
  expect(result.current.amending).toBe(false);
  expect(result.current.draft?.reasoning).toBe("Unfinished amendment");

  act(() => result.current.startAmendment());
  act(() => result.current.discardAmendment());
  expect(result.current.amending).toBe(false);
  expect(result.current.draft).toEqual({
    position: "Fund",
    amount: "40",
    reasoning: "Original",
    observations: [],
    note: "",
  });
  expect(result.current.amendmentDraft).toBe(false);
  await waitFor(() => expect(result.current.dirty).toBe(false));
});
