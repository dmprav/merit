import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

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

type SaveResult = Awaited<ReturnType<ReviewData["save"]>>;

const contact = (id: string, name: string, email: string) => ({
  id,
  name,
  email,
  affiliation: "",
  archived: false,
  revision: 0,
  applicationTitles: [],
});

beforeEach(() => {
  vi.mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder",
    contacts: [
      contact("unnamed", "", "reviewer@example.test"),
      contact("sam", "Sam Morgan", "sam@example.test"),
      contact("jules", "Jules Patel", "jules@example.test"),
    ],
  });
});

const opened: ReviewBaseline = {
  revision: reviewRevisionSchema.parse(1),
  applicationVersion: materialVersionSchema.parse(2),
  criteriaVersion: criteriaVersionSchema.parse(1),
};
const newer: ReviewBaseline = {
  revision: reviewRevisionSchema.parse(2),
  applicationVersion: materialVersionSchema.parse(3),
  criteriaVersion: criteriaVersionSchema.parse(2),
};
const request = {
  action: "request",
  contactId: "sam",
  id: expect.any(String) as unknown,
  replacesId: null,
};

const showPicker = async (save: ReviewData["save"]) => {
  const client = createQueryClient();
  const view = render(<Picker baseline={opened} save={save} />, {
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
  await screen.findByRole("option", { name: /Sam Morgan/ });
  return {
    picker,
    user,
    rerender: (baseline: ReviewBaseline) =>
      view.rerender(<Picker baseline={baseline} save={save} />),
  };
};

it("offers only named contacts who have not already been requested", async () => {
  const { picker } = await showPicker(vi.fn<ReviewData["save"]>());

  expect(picker.getByRole("option", { name: /Sam Morgan/ })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(picker.getByRole("option", { name: /Jules Patel/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(picker.getByRole("option", { name: "reviewer@example.test" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(picker.queryByRole("option", { name: "No contact" })).not.toBeInTheDocument();
});

it("records the selected reviewer against the version the picker opened with", async () => {
  const save = vi.fn<ReviewData["save"]>().mockResolvedValue({
    status: "ok",
    revision: reviewRevisionSchema.parse(2),
  });
  const { picker, user, rerender } = await showPicker(save);

  rerender(newer);
  await user.click(picker.getByRole("option", { name: /Sam Morgan/ }));

  expect(save).toHaveBeenCalledExactlyOnceWith(request, opened);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("blocks closing and further choices while the request saves", async () => {
  const save = vi
    .fn<ReviewData["save"]>()
    .mockImplementation(() => new Promise<SaveResult>(() => {}));
  const { picker, user } = await showPicker(save);

  await user.click(picker.getByRole("option", { name: /Sam Morgan/ }));

  expect(picker.getByRole("button", { name: "Close" })).toBeDisabled();
  expect(picker.getByRole("option", { name: /Sam Morgan/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.click(picker.getByRole("option", { name: /Sam Morgan/ }));
  expect(save).toHaveBeenCalledOnce();
});

it("retries a failed request with the same command and opened version", async () => {
  const save = vi
    .fn<ReviewData["save"]>()
    .mockResolvedValueOnce({ status: "unavailable" })
    .mockResolvedValueOnce({ status: "ok", revision: reviewRevisionSchema.parse(2) });
  const { picker, user, rerender } = await showPicker(save);
  await user.click(picker.getByRole("option", { name: /Sam Morgan/ }));

  await waitFor(() =>
    expect(picker.getByRole("alert")).toHaveTextContent(
      "Could not save. Your changes are preserved; please try again.",
    ),
  );
  rerender(newer);
  await user.click(picker.getByRole("button", { name: "Retry" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  expect(save.mock.calls[1]?.[1]).toEqual(opened);
});

it("starts a new request from the current version when the picker reopens", async () => {
  const save = vi
    .fn<ReviewData["save"]>()
    .mockResolvedValue({ status: "ok", revision: reviewRevisionSchema.parse(2) });
  const { picker, user, rerender } = await showPicker(save);
  await user.click(picker.getByRole("option", { name: /Sam Morgan/ }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  rerender(newer);
  await user.click(screen.getByRole("button", { name: "Add review request" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("option", { name: /Sam Morgan/ }));

  expect(save).toHaveBeenLastCalledWith(request, newer);
  expect(save.mock.calls[1]?.[0]).not.toEqual(save.mock.calls[0]?.[0]);
});
