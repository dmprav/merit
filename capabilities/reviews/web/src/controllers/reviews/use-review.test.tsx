import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { applicationView } from "@merit/grantmaking/api";
import { makeApplication, makeAssessment, makeRound } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";
import { reviewRevisionSchema } from "@merit/reviews/domain";

import type { ReviewData, ReviewProps } from "../../contracts/reviews";
import { DraftContext } from "./drafts";
import { useReview } from "./use-review";

const setup = (
  overrides: Partial<Pick<ReviewProps, "application" | "availableApplicationVersions">> = {},
) => {
  const round = makeRound();
  const application = applicationView(
    makeApplication({
      version: 2,
      reviews: { revision: 3, requests: [], assessments: [] },
    }),
  );
  const data = {
    draftKey: "application",
    workspaceSlug: "alder",
    save: vi.fn<ReviewData["save"]>(),
    refresh: vi.fn<ReviewData["refresh"]>(),
  };
  const props = { application, round, data, ...overrides };
  const client = createQueryClient();
  const hook = renderHook((current) => useReview(current), {
    initialProps: props,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <DraftContext value={{ reviewEdits: {}, setReviewEdit: vi.fn() }}>{children}</DraftContext>
      </QueryClientProvider>
    ),
  });
  return { ...hook, data, props };
};

const assessmentWithVersions = (id: string, applicationVersions: (number | null)[]) => {
  const original = makeAssessment().versions[0]!;
  return makeAssessment({
    id,
    versions: applicationVersions.map((applicationVersion) => ({
      ...original,
      content: { ...original.content, applicationVersion },
    })),
  });
};

it("offers the current application version when no history or assessments are available", () => {
  const { result } = setup();

  expect([...result.current.versions]).toEqual([2]);
});

it("includes earlier assessment bases and deduplicates versions across all sources", () => {
  const { result } = setup({
    application: applicationView(
      makeApplication({
        version: 7,
        reviews: {
          revision: 3,
          requests: [],
          assessments: [
            assessmentWithVersions("first", [2, 4, 3]),
            assessmentWithVersions("second", [null, 1, 2, 7]),
          ],
        },
      }),
    ),
    availableApplicationVersions: [4, 6, 4, 7].map((version) =>
      materialVersionSchema.parse(version),
    ),
  });

  expect([...result.current.versions]).toEqual([7, 4, 6, 2, 3, 1]);
});

it("does not invent application versions for assessments with unknown bases", () => {
  const { result } = setup({
    application: applicationView(
      makeApplication({
        version: 2,
        reviews: {
          revision: 3,
          requests: [],
          assessments: [assessmentWithVersions("unknown", [null, null])],
        },
      }),
    ),
  });

  expect([...result.current.versions]).toEqual([2]);
});

it("updates selectable versions when history and application assessments arrive", () => {
  const { result, rerender, props } = setup();
  const initialVersions = result.current.versions;
  const loadedHistory = {
    ...props,
    availableApplicationVersions: [1, 4].map((version) => materialVersionSchema.parse(version)),
  };

  rerender(loadedHistory);

  expect([...result.current.versions]).toEqual([2, 1, 4]);

  rerender({
    ...loadedHistory,
    application: applicationView(
      makeApplication({
        version: 5,
        reviews: {
          revision: 4,
          requests: [],
          assessments: [assessmentWithVersions("received", [3, 2])],
        },
      }),
    ),
  });

  expect([...result.current.versions]).toEqual([5, 1, 4, 3, 2]);
  expect([...initialVersions]).toEqual([2]);
});

it("retains invalid-review details and authentication outcomes without translating them", async () => {
  const { result, data } = setup();
  const invalid = { status: "invalid", error: "contact_unavailable" } as const;
  data.save.mockResolvedValueOnce(invalid).mockResolvedValueOnce({ status: "signed_out" });
  const request = result.current.beginRequest("original-request");

  await act(async () => expect(await request("sam", "replacement")).toEqual(invalid));
  expect(data.save).toHaveBeenLastCalledWith(
    { action: "request", id: "replacement", contactId: "sam", replacesId: "original-request" },
    {
      revision: 3,
      applicationVersion: 2,
      criteriaVersion: 1,
    },
  );
  await act(async () =>
    expect(await request("sam", "replacement")).toEqual({ status: "signed_out" }),
  );
  expect(data.refresh).not.toHaveBeenCalled();
  expect(result.current.saved).toBe(0);
});

it("keeps request and assessment conflicts distinct when loading current work also fails", async () => {
  const { result, data } = setup();
  data.save.mockResolvedValue({ status: "conflict" });
  data.refresh.mockRejectedValue(new Error("Offline"));

  await act(async () =>
    expect(await result.current.beginRequest()("sam", "request")).toEqual({
      status: "request_conflict",
    }),
  );
  expect(result.current.refreshError).toBe("read");
  await act(() => result.current.cancelRequest("request"));
  expect(result.current.error).toEqual({ status: "conflict" });
  expect(result.current.saved).toBe(0);
});

it("preserves a committed request through a failed refresh and retries only the read", async () => {
  const { result, data } = setup();
  data.save.mockResolvedValue({ status: "ok", revision: reviewRevisionSchema.parse(4) });
  let failRefresh!: (error: Error) => void;
  data.refresh.mockImplementation(
    () =>
      new Promise((_, reject) => {
        failRefresh = reject;
      }),
  );
  let save!: Promise<unknown>;
  act(() => {
    save = result.current.beginRequest()("sam", "request");
  });
  await waitFor(() => expect(result.current.saved).toBe(1));
  expect(result.current.saving).toBe(true);
  await act(async () => {
    failRefresh(new Error("Offline"));
    expect(await save).toBeNull();
  });
  expect(result.current.refreshError).toBe("saved");
  expect(result.current.saving).toBe(false);

  data.refresh.mockResolvedValue(undefined);
  await act(() => result.current.refresh());
  expect(result.current.refreshError).toBeNull();
  expect(result.current.saved).toBe(1);
  expect(data.save).toHaveBeenCalledOnce();
});
