import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import type { ContactsSource } from "@merit/contacts-web/contracts";
import { ContactsProvider } from "@merit/contacts-web/provider";
import { createQueryClient } from "@merit/query";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { Button } from "@merit/ui/button";

import type { ReviewBaseline, ReviewData } from "../../contracts/reviews";
import { RequestPicker, useReview } from "../../reviews";
import { makeApplication, makeRound } from "../../testing/fixtures";
import { GrantmakingDrafts, GrantmakingMessagesProvider } from "../../testing/providers";

const Picker = ({ baseline, save }: { baseline: ReviewBaseline; save: ReviewData["save"] }) => {
  const { beginRequest } = useReview({
    application: makeApplication({
      version: baseline.applicationVersion,
      reviews: { revision: baseline.revision, requests: [], assessments: [] },
    }),
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

const contacts: ContactsSource = {
  scope: (workspace) => [workspace],
  read: async () => ({
    status: "ok",
    workspaceName: "Alder",
    contacts: [
      contact("unnamed", "", "reviewer@example.test"),
      contact("sam", "Sam Morgan", "sam@example.test"),
      contact("jules", "Jules Patel", "jules@example.test"),
    ],
  }),
  save: vi.fn(),
};

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
        <GrantmakingMessagesProvider>
          <ContactsProvider source={contacts}>
            <GrantmakingDrafts storageScope="picker-test">{children}</GrantmakingDrafts>
          </ContactsProvider>
        </GrantmakingMessagesProvider>
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

it("explains the request before the reviewer choice", async () => {
  const { picker } = await showPicker(vi.fn<ReviewData["save"]>());
  const hint = picker.getByText("Choose a reviewer to record a request. No message is sent.");

  expect(
    hint.compareDocumentPosition(picker.getByRole("textbox", { name: "Find a contact" })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

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

  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeVisible();
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

it.each<{ name: string; rejection: Exclude<SaveResult, { status: "ok" }>; message: string }>([
  {
    name: "request conflict",
    rejection: { status: "conflict" },
    message:
      "The application or review work changed. Close and reopen this picker to use the latest information.",
  },
  {
    name: "contact_unavailable",
    rejection: { status: "invalid", error: "contact_unavailable" },
    message: "Select an active contact with a reviewer name.",
  },
  {
    name: "already_requested",
    rejection: { status: "invalid", error: "already_requested" },
    message: "This person already has an outstanding request for this application.",
  },
  {
    name: "request_unavailable",
    rejection: { status: "invalid", error: "request_unavailable" },
    message: "This request has already changed. Review the latest requests.",
  },
  {
    name: "assessment_unavailable",
    rejection: { status: "invalid", error: "assessment_unavailable" },
    message: "This assessment is no longer available. Review the latest assessments.",
  },
  {
    name: "follow_up_required",
    rejection: { status: "invalid", error: "follow_up_required" },
    message: "An assessment already exists for this reviewer. Use Record follow-up assessment.",
  },
  {
    name: "version_unavailable",
    rejection: { status: "invalid", error: "version_unavailable" },
    message:
      "The selected review basis is no longer available. Check the application and criteria versions.",
  },
  {
    name: "criteria_unavailable",
    rejection: { status: "invalid", error: "criteria_unavailable" },
    message:
      "The selected review basis is no longer available. Check the application and criteria versions.",
  },
  {
    name: "invalid_review",
    rejection: { status: "invalid", error: "invalid_review" },
    message: "Check the assessment text and amount.",
  },
  {
    name: "reviewer_authored",
    rejection: { status: "invalid", error: "reviewer_authored" },
    message: "This assessment belongs to the reviewer. Ask them to submit an amendment.",
  },
  {
    name: "application_withdrawn",
    rejection: { status: "invalid", error: "application_withdrawn" },
    message: "This application is withdrawn. Reinstate it to change its reviews.",
  },
  {
    name: "not_found",
    rejection: { status: "not_found" },
    message: "This workspace is no longer available to you.",
  },
  {
    name: "signed_out",
    rejection: { status: "signed_out" },
    message: "This workspace is no longer available to you.",
  },
])("explains a $name rejection and keeps the picker open", async ({ rejection, message }) => {
  const { picker, user } = await showPicker(
    vi.fn<ReviewData["save"]>().mockResolvedValue(rejection),
  );

  await user.click(picker.getByRole("option", { name: /Sam Morgan/ }));

  expect(await picker.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByRole("dialog")).toBeVisible();
});
