import { QueryClientProvider } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";

import { ApplicationListViews } from "@merit/grantmaking-web/rounds";
import type { ApplicationOverview } from "@merit/grantmaking/api";
import { createQueryClient } from "@merit/query";

import { applicationsOptions } from "./queries";
import { readWorkspaceApplications } from "./server/funding-round.functions";
import { useWorkspaceApplications } from "./workspace-applications";

vi.mock("./server/funding-round.functions", () => ({ readWorkspaceApplications: vi.fn() }));

const application: ApplicationOverview = {
  id: "b8q3w5j7c2df",
  title: "Alder project",
  applicant: null,
  roundId: "k7m2p9x4n6rt",
  roundTitle: "Grants",
  intakeStatus: "ready",
  withdrawn: false,
  requested: null,
  reviews: { current: 0, outstanding: 0, outdated: 0, unknown: 0 },
  criteriaChanged: false,
  decision: null,
  recommendation: null,
};

it("uses the same cache identity for the loader and explicit default page", () => {
  expect(applicationsOptions("alder").queryKey).toEqual(
    applicationsOptions("alder", {
      query: "",
      offset: 0,
      filter: {},
      direction: "ascending",
      roundId: undefined,
    }).queryKey,
  );
});

it("hydrates the loader's page before refreshing data that became stale in transit", async () => {
  const client = createQueryClient();
  const initial = {
    status: "ok" as const,
    applications: [application],
    total: 1,
    matching: 1,
    offset: 0,
  };
  const key = applicationsOptions("alder").queryKey;
  client.setQueryData(key, initial);
  let finish: (() => void) | undefined;
  vi.mocked(readWorkspaceApplications).mockImplementation(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return initial;
  });

  const Summary = () => {
    const { pagination } = useWorkspaceApplications("alder", { viewId: "workspace" });
    return <div>{pagination.loading ? <span>Loading applications</span> : "1 application"}</div>;
  };

  const view = (
    <QueryClientProvider client={client}>
      <ApplicationListViews>
        <Summary />
      </ApplicationListViews>
    </QueryClientProvider>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(view);
  expect(container).toHaveTextContent("1 application");
  client.setQueryData(key, initial, { updatedAt: Date.now() - 5000 });
  document.body.appendChild(container);
  const onRecoverableError = vi.fn();
  let root: ReturnType<typeof hydrateRoot>;
  try {
    await act(async () => {
      root = hydrateRoot(container, view, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    await waitFor(() => expect(finish).toBeDefined());
    expect(container).toHaveTextContent("Loading applications");
    await act(async () => finish?.());
    await waitFor(() => expect(container).toHaveTextContent("1 application"));
  } finally {
    act(() => root?.unmount());
    client.clear();
    container.remove();
  }
});
