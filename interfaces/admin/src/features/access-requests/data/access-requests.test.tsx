import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import { useAccessRequestsData } from "./access-requests";
import { accessRequestsOptions } from "./queries";
import { readAccessRequests, reviewAccessRequest } from "./server/access-requests.functions";

vi.mock("./server/access-requests.functions", () => ({
  readAccessRequests: vi.fn(),
  reviewAccessRequest: vi.fn(),
}));

const request = {
  email: "leah@example.test",
  requestedAt: new Date("2026-11-09T10:00:00Z"),
  reviewedAt: null,
  reviewedBy: null,
};
const reviewed = {
  ...request,
  reviewedAt: new Date("2026-11-11T10:00:00Z"),
  reviewedBy: "operator",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readAccessRequests).mockResolvedValue({ status: "ok", value: [request] });
  vi.mocked(reviewAccessRequest).mockResolvedValue({ status: "ok", value: reviewed });
});

const setup = () => {
  const client = createQueryClient();
  client.setQueryData(accessRequestsOptions().queryKey, () => ({
    status: "ok" as const,
    value: [request],
  }));
  const hook = renderHook(
    () => ({ query: useQuery(accessRequestsOptions()), data: useAccessRequestsData() }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { ...hook, client };
};

it("keeps the saved review and retries only the read after refresh failure", async () => {
  const { result, client } = setup();
  vi.mocked(readAccessRequests).mockRejectedValueOnce(new Error("Read failed"));
  await act(() => result.current.data.review(request.email));

  expect(result.current.query.data).toEqual({ status: "ok", value: [reviewed] });
  expect(result.current.data.refreshFailed).toBe(true);
  expect(result.current.data.error).toBeNull();

  vi.mocked(readAccessRequests).mockResolvedValue({ status: "ok", value: [reviewed] });
  await act(() => result.current.data.refresh());

  expect(result.current.data.refreshFailed).toBe(false);
  expect(reviewAccessRequest).toHaveBeenCalledExactlyOnceWith({ data: { email: request.email } });
  client.clear();
});

it("reports a committed review when updating the cache fails", async () => {
  const { result, client } = setup();
  vi.spyOn(client, "setQueryData").mockImplementationOnce(() => {
    throw new Error("Cache failed");
  });
  await act(() => result.current.data.review(request.email));

  expect(result.current.data.refreshFailed).toBe(true);
  expect(result.current.data.error).toBeNull();

  vi.mocked(readAccessRequests).mockResolvedValue({ status: "ok", value: [reviewed] });
  await act(() => result.current.data.refresh());

  expect(result.current.query.data).toEqual({ status: "ok", value: [reviewed] });
  expect(result.current.data.refreshFailed).toBe(false);
  expect(reviewAccessRequest).toHaveBeenCalledOnce();
  client.clear();
});

it.each(["rejected", "unavailable"])(
  "retains the original record after a %s write and permits retry",
  async (failure) => {
    const { result, client } = setup();
    if (failure === "rejected") {
      vi.mocked(reviewAccessRequest).mockResolvedValueOnce({ status: "forbidden" });
    } else {
      vi.mocked(reviewAccessRequest).mockRejectedValueOnce(new Error("Write failed"));
    }
    await act(() => result.current.data.review(request.email));

    expect(result.current.query.data).toEqual({ status: "ok", value: [request] });
    await waitFor(() =>
      expect(result.current.data.error?.status).toBe(
        failure === "rejected" ? "forbidden" : "unavailable",
      ),
    );
    expect(result.current.data.refreshFailed).toBe(false);

    vi.mocked(readAccessRequests).mockResolvedValue({ status: "ok", value: [reviewed] });
    await act(() => result.current.data.review(request.email));
    await waitFor(() => expect(result.current.data.error).toBeNull());

    expect(result.current.query.data).toEqual({ status: "ok", value: [reviewed] });
    expect(reviewAccessRequest).toHaveBeenCalledTimes(2);
    client.clear();
  },
);
