import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { applicationView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";
import type { ReviewData, ReviewBaseline } from "@merit/reviews-web/contracts";
import { useReview } from "@merit/reviews-web/reviews";
import { RequestPicker } from "@merit/reviews-web/reviews";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { Button } from "@merit/ui/button";

import { WebMessagesProvider } from "../../../../app/messages";
import { WorkspaceContacts } from "../../../contacts/contacts-provider";
import { readContacts } from "../../../contacts/data/server/contacts.functions";

vi.mock("../../../contacts/data/server/contacts.functions", () => ({
  readContacts: vi.fn(),
  saveContact: vi.fn(),
}));

const Picker = ({ baseline, save }: { baseline: ReviewBaseline; save: ReviewData["save"] }) => {
  const { beginRequest } = useReview({
    application: applicationView(
      makeApplication({
        version: baseline.applicationVersion,
        reviews: { revision: baseline.revision, requests: [], assessments: [] },
      }),
    ),
    round: makeRound({
      criteriaVersion: baseline.criteriaVersion,
      criteriaHistory: [{ version: baseline.criteriaVersion, criteria: [] }],
    }),
    data: {
      draftKey: "picker-test",
      workspaceSlug: "alder",
      save,
      refresh: async () => {},
    },
  });
  return (
    <RequestPicker
      workspaceSlug="alder"
      disabledContactIds={["jules"]}
      onBegin={beginRequest}
      trigger={<Button>Add review request</Button>}
    />
  );
};

it("records a request on selection, prevents duplicate clicks, and retries the same command against the opened version", async () => {
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder",
    contacts: [
      {
        id: "email-only",
        name: "",
        email: "reviewer@example.test",
        affiliation: "",
        archived: false,
        revision: 0,
        applicationTitles: [],
      },
      {
        id: "sam",
        name: "Sam Morgan",
        email: "sam@example.test",
        affiliation: "",
        archived: false,
        revision: 0,
        applicationTitles: [],
      },
      {
        id: "jules",
        name: "Jules Patel",
        email: "",
        affiliation: "",
        archived: false,
        revision: 0,
        applicationTitles: [],
      },
    ],
  });
  let finish!: (result: Awaited<ReturnType<ReviewData["save"]>>) => void;
  const save = vi
    .fn<ReviewData["save"]>()
    .mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<ReviewData["save"]>>>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ status: "ok", revision: reviewRevisionSchema.parse(2) });
  const baseline: ReviewBaseline = {
    revision: reviewRevisionSchema.parse(1),
    applicationVersion: materialVersionSchema.parse(2),
    criteriaVersion: criteriaVersionSchema.parse(1),
  };
  const client = createQueryClient();
  const props = { baseline, save };
  const view = render(<Picker {...props} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <WebMessagesProvider>
          <WorkspaceContacts>
            <GrantmakingDrafts storageScope="picker-test">{children}</GrantmakingDrafts>
          </WorkspaceContacts>
        </WebMessagesProvider>
      </QueryClientProvider>
    ),
  });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add review request" }));
  const picker = within(screen.getByRole("dialog"));

  await waitFor(() =>
    expect(picker.getByRole("option", { name: /Jules Patel/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    ),
  );
  expect(picker.queryByRole("option", { name: "No contact" })).not.toBeInTheDocument();
  expect(picker.getByRole("option", { name: "reviewer@example.test" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  view.rerender(
    <Picker
      {...props}
      baseline={{
        revision: reviewRevisionSchema.parse(2),
        applicationVersion: materialVersionSchema.parse(3),
        criteriaVersion: criteriaVersionSchema.parse(2),
      }}
    />,
  );
  await user.click(picker.getByRole("option", { name: /Sam Morgan/ }));

  expect(save).toHaveBeenCalledExactlyOnceWith(
    { action: "request", contactId: "sam", id: expect.any(String) as unknown, replacesId: null },
    baseline,
  );
  expect(picker.getByRole("button", { name: "Close" })).toBeDisabled();
  expect(picker.getByRole("option", { name: /Sam Morgan/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  finish({ status: "unavailable" });

  await waitFor(() =>
    expect(picker.getByRole("alert")).toHaveTextContent(
      "Could not save. Your changes are preserved; please try again.",
    ),
  );

  await user.click(picker.getByRole("button", { name: "Retry" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);

  await user.click(await screen.findByRole("button", { name: "Add review request" }));
  save.mockResolvedValueOnce({ status: "ok", revision: reviewRevisionSchema.parse(3) });
  await user.click(within(screen.getByRole("dialog")).getByRole("option", { name: /Sam Morgan/ }));
  expect(save).toHaveBeenLastCalledWith(
    { action: "request", contactId: "sam", id: expect.any(String) as unknown, replacesId: null },
    { revision: 2, applicationVersion: 3, criteriaVersion: 2 },
  );
  expect(save.mock.calls[2]?.[0]).not.toEqual(save.mock.calls[0]?.[0]);
});
