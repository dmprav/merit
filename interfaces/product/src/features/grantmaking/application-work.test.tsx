import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import type { ApplicationData } from "@merit/grantmaking-web/contracts/pages";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { applicationView, roundView } from "@merit/grantmaking/api";
import { makeReviewedApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";

import { WebMessagesProvider } from "../../app/messages";
import { ApplicationWork } from "./application-work";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

const round = roundView(makeRound());

const dataFor = (id: string, disabled = false): ApplicationData => ({
  round,
  application: applicationView({ ...makeReviewedApplication(), id, title: `Project ${id}` }),
  key: id,
  recommendation: { revision: 0, disabled, save: vi.fn() },
  intake: null,
  reviews: null,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <WebMessagesProvider>
    <GrantmakingDrafts>{children}</GrantmakingDrafts>
  </WebMessagesProvider>
);

const view = (data: ApplicationData) => (
  <ApplicationWork
    data={data}
    roundLocation={{
      to: "/app/$workspaceSlug/rounds/$roundRef",
      params: { workspaceSlug: "alder", roundRef: "round-k7m2p9x4n6rt" },
    }}
    onTabChange={vi.fn()}
  />
);

it("shows application evidence without initializing unavailable intake or review editors", () => {
  render(view(dataFor("first", true)), { wrapper });

  expect(screen.getByRole("heading", { name: "Project first" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Applicant submission" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Edit application details" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Edit recommendation for/ })).toBeDisabled();
});

it("resets active editing when the record changes while retaining each record's recommendation draft", async () => {
  const user = userEvent.setup();
  const first = dataFor("first");
  const second = dataFor("second");
  const { rerender } = render(view(first), { wrapper });
  await user.click(
    screen.getByRole("button", { name: `Edit recommendation for ${first.application.title}` }),
  );
  await user.clear(screen.getByLabelText(/Reasoning/));
  await user.type(screen.getByLabelText(/Reasoning/), "Writing for the first application");

  rerender(view(second));

  expect(screen.queryByRole("form")).not.toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: `Edit recommendation for ${second.application.title}` }),
  );

  expect(screen.getByLabelText(/Reasoning/)).toHaveValue(
    second.application.managerRecommendation!.reasoning,
  );

  await user.clear(screen.getByLabelText(/Reasoning/));
  await user.type(screen.getByLabelText(/Reasoning/), "Writing for the second application");

  rerender(view(first));

  expect(screen.queryByRole("form")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Resume editing recommendation/ }));

  expect(screen.getByLabelText(/Reasoning/)).toHaveValue("Writing for the first application");
  expect(first.recommendation.save).not.toHaveBeenCalled();
  expect(second.recommendation.save).not.toHaveBeenCalled();
});

it("closes active recommendation editing when intake access changes and retains its recoverable draft", async () => {
  const user = userEvent.setup();
  const data = dataFor("first");
  const editable: ApplicationData = {
    ...data,
    intake: {
      draftKey: data.key,
      workspaceSlug: "alder",
      publicId: "m7n2p9x4k6rt",
      state: { revision: 0, workingRevision: null, history: [] },
      save: vi.fn(),
      refresh: vi.fn(),
      refreshCurrent: vi.fn(),
    },
  };
  const client = createQueryClient();
  const { rerender } = render(view(editable), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <WebMessagesProvider>
          <GrantmakingDrafts>{children}</GrantmakingDrafts>
        </WebMessagesProvider>
      </QueryClientProvider>
    ),
  });
  await user.click(
    screen.getByRole("button", { name: `Edit recommendation for ${data.application.title}` }),
  );
  await user.clear(screen.getByLabelText(/Reasoning/));
  await user.type(screen.getByLabelText(/Reasoning/), "Unfinished recommendation");
  rerender(view(data));

  expect(screen.queryByRole("form")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Resume editing recommendation/ }));

  expect(screen.getByLabelText(/Reasoning/)).toHaveValue("Unfinished recommendation");
  expect(data.recommendation.save).not.toHaveBeenCalled();
});
