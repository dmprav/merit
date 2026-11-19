import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import type { ContactsSource } from "@merit/contacts-web/contracts";
import { ContactsProvider } from "@merit/contacts-web/provider";
import { readDraftStorage, seedDraftStorage } from "@merit/drafts/testing";
import { makeApplication, makeAssessment, makeRound } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import type { ManagerReviewerData } from "../../contracts/reviewer";
import type { ReviewData, ReviewProps } from "../../contracts/reviews";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { GrantmakingDrafts } from "../../testing/providers";
import { reviewerPage } from "../reviewer/reviewer.story-fixtures";
import { ReviewWork } from "./review-work";

// jsdom cannot scroll a newly revealed writing field into view.

const criteria = [
  {
    id: "7bb21220-ecc6-5a1b-9eec-1a47e5e66bc4",
    title: "Local benefit",
    description: "Who benefits from the project?",
  },
];
const assessment = makeAssessment({
  versions: [
    {
      content: {
        applicationVersion: 1,
        criteriaVersion: 1,
        date: null,
        position: null,
        amount: null,
        reasoning: "Local participation.",
        observations: [],
      },
      criteria,
      recorder: null,
      note: "",
    },
  ],
});
const application = makeApplication({
  version: 2,
  reviews: { revision: 3, requests: [], assessments: [assessment] },
});
const round = makeRound({ criteria, criteriaHistory: [{ version: 1, criteria }] });
const request = {
  id: "c0c0979c-33f6-591a-b26b-495748f4d457",
  contactId: "another-reviewer",
  reviewer: "Pat Reviewer",
  applicationVersion: application.version,
  criteriaVersion: round.criteriaVersion,
  criteria: round.criteria,
  status: "outstanding" as const,
  recorder: null,
  closedBy: null,
};
const draftKey = "alder/b8q3w5j7c2df";
afterEach(() => sessionStorage.clear());

const renderReview = (
  overrides: Partial<ReviewProps> = {},
  scope = "dana",
  contactsSource?: ContactsSource,
) => {
  const data: ReviewData = {
    draftKey,
    workspaceSlug: "alder",
    save: vi
      .fn<ReviewData["save"]>()
      .mockResolvedValue({ status: "ok", revision: reviewRevisionSchema.parse(1) }),
    refresh: vi.fn<ReviewData["refresh"]>().mockResolvedValue(undefined),
  };
  const props: ReviewProps = { application, round, data, ...overrides };
  const client = createQueryClient();
  const view = render(<ReviewWork {...props} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <GrantmakingMessagesProvider>
          <GrantmakingDrafts storageScope={scope}>
            {contactsSource ? (
              <ContactsProvider source={contactsSource}>{children}</ContactsProvider>
            ) : (
              children
            )}
          </GrantmakingDrafts>
        </GrantmakingMessagesProvider>
      </QueryClientProvider>
    ),
  });

  return { ...view, props, data, user: userEvent.setup() };
};

const openCorrection = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    await screen.findByRole("button", { name: `Assessment actions for ${assessment.reviewer}` }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Edit recorded assessment" }));
  return within(await screen.findByRole("form", { name: "Edit recorded assessment" }));
};

it("shows an assessment and its basis with only review facts and no draft or query provider", () => {
  render(<ReviewWork application={application} round={round} />, {
    wrapper: GrantmakingMessagesProvider,
  });

  expect(
    screen.getByRole("article", { name: `Assessment by ${assessment.reviewer}` }),
  ).toBeVisible();
  expect(screen.getByText("Based on an earlier submission")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Record assessment" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Assessment actions/ })).not.toBeInTheDocument();
});

it("offers distinct current and historical application bases and saves the selected version", async () => {
  const { user, data } = renderReview({
    application: { ...application, version: materialVersionSchema.parse(4) },
    availableApplicationVersions: [3, 4, 3].map((version) => materialVersionSchema.parse(version)),
  });
  const form = await openCorrection(user);
  await user.click(form.getByRole("button", { name: /Application material reviewed/ }));

  const options = screen.getAllByRole("option");
  const labels = ["Not known", "Version 4 (current)", "Version 3", "Version 1"];
  expect(options).toHaveLength(labels.length);
  options.forEach((option, index) => expect(option).toHaveAccessibleName(labels[index]));
  expect(screen.getByRole("option", { name: "Version 1" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await user.click(screen.getByRole("option", { name: "Version 3" }));
  await user.click(form.getByRole("button", { name: "Save assessment" }));

  const expectedContent: unknown = expect.objectContaining({ applicationVersion: 3 });
  expect(data.save).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "edit",
      content: expectedContent,
    }),
    expect.objectContaining({ applicationVersion: 4 }),
  );
});

it("closes an untouched assessment without leaving a resumable draft", async () => {
  const { user, data } = renderReview();
  const form = await openCorrection(user);
  await user.click(form.getByRole("button", { name: "Close" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Resume editing" })).not.toBeInTheDocument();
  expect(data.save).not.toHaveBeenCalled();
});

it("keeps the assessment editor open while its save is pending", async () => {
  const { user, data } = renderReview();
  vi.mocked(data.save).mockImplementation(() => new Promise(() => {}));
  const form = await openCorrection(user);
  await user.click(form.getByRole("button", { name: "Save assessment" }));

  expect(form.getByRole("button", { name: "Save assessment" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("form", { name: "Edit recorded assessment" })).toBeVisible();
});

it("keeps request and assessment actions disabled until a retained draft is discarded", async () => {
  const { user, data } = renderReview({
    application: { ...application, reviews: { ...application.reviews, requests: [request] } },
  });
  const pending = within(await screen.findByRole("article", { name: request.reviewer }));
  const form = await openCorrection(user);
  await user.clear(form.getByRole("textbox", { name: "Assessment text" }));
  await user.type(
    form.getByRole("textbox", { name: "Assessment text" }),
    "An unfinished judgment.",
  );
  await user.click(form.getByRole("button", { name: "Close" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Add review request" })).not.toBeInTheDocument();
  expect(pending.getByRole("button", { name: "Record assessment" })).toBeDisabled();
  expect(
    pending.getByRole("button", { name: `Request actions for ${request.reviewer}` }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: `Assessment actions for ${assessment.reviewer}` }),
  ).toBeDisabled();
  const resume = screen.getByRole("button", { name: "Resume editing" });
  expect(resume).toHaveAttribute("data-draft", "true");
  await user.click(resume);

  const resumed = within(screen.getByRole("form", { name: "Edit recorded assessment" }));
  expect(resumed.getByRole("textbox", { name: "Assessment text" })).toHaveValue(
    "An unfinished judgment.",
  );
  await user.click(resumed.getByRole("button", { name: "Discard draft" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Resume editing" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add review request" })).toBeEnabled();
  expect(pending.getByRole("button", { name: "Record assessment" })).toBeEnabled();
  expect(
    pending.getByRole("button", { name: `Request actions for ${request.reviewer}` }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: `Assessment actions for ${assessment.reviewer}` }),
  ).toBeEnabled();
  expect(data.save).not.toHaveBeenCalled();
});

it("disables all review actions during a request cancellation and restores them after failure", async () => {
  const { user, data } = renderReview({
    application: { ...application, reviews: { ...application.reviews, requests: [request] } },
  });
  let finishSave!: (result: Awaited<ReturnType<ReviewData["save"]>>) => void;
  vi.mocked(data.save).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  await user.click(
    await screen.findByRole("button", { name: `Request actions for ${request.reviewer}` }),
  );
  await user.click(screen.getByRole("menuitem", { name: "Cancel request" }));

  expect(screen.getByRole("button", { name: "Add review request" })).toBeDisabled();
  for (const record of screen.getAllByRole("button", { name: "Record assessment" })) {
    expect(record).toBeDisabled();
  }
  expect(
    screen.getByRole("button", { name: `Request actions for ${request.reviewer}` }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: `Assessment actions for ${assessment.reviewer}` }),
  ).toBeDisabled();

  await act(async () => finishSave({ status: "unavailable" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(screen.getByRole("button", { name: "Add review request" })).toBeEnabled();
  for (const record of screen.getAllByRole("button", { name: "Record assessment" })) {
    expect(record).toBeEnabled();
  }
  expect(
    screen.getByRole("button", { name: `Request actions for ${request.reviewer}` }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: `Assessment actions for ${assessment.reviewer}` }),
  ).toBeEnabled();
  expect(data.save).toHaveBeenCalledExactlyOnceWith(
    { action: "cancel", id: request.id },
    {
      revision: application.reviews.revision,
      applicationVersion: application.version,
      criteriaVersion: round.criteriaVersion,
    },
  );
  expect(data.refresh).not.toHaveBeenCalled();
});

it("recovers existing account-scoped review drafts and clears them only after a successful correction", async () => {
  await seedDraftStorage("dana", "reviews", {
    [draftKey]: {
      mode: "edit",
      id: assessment.id,
      revision: application.reviews.revision,
      applicationVersion: application.version,
      criteriaVersion: round.criteriaVersion,
      values: {
        contactId: assessment.contactId,
        applicationVersion: "1",
        criteriaVersion: "1",
        date: "",
        position: "unknown",
        amount: "",
        reasoning: "Recovered correction",
        observations: [],
        note: "Corrected transcription",
      },
    },
  });

  const other = renderReview({}, "leah");

  expect(screen.queryByRole("button", { name: "Resume editing" })).not.toBeInTheDocument();

  other.unmount();

  const { user, data } = renderReview();

  await user.click(await screen.findByRole("button", { name: "Resume editing" }));

  const form = within(screen.getByRole("form", { name: "Edit recorded assessment" }));
  expect(form.getByRole("textbox", { name: "Assessment text" })).toHaveValue(
    "Recovered correction",
  );

  vi.mocked(data.save).mockResolvedValueOnce({ status: "unavailable" });
  await user.click(form.getByRole("button", { name: "Save assessment" }));

  expect(form.getByRole("alert")).toHaveTextContent("Could not save");
  expect(await readDraftStorage("dana", "reviews")).toMatchObject({
    [draftKey]: { values: { reasoning: "Recovered correction" } },
  });

  await user.click(form.getByRole("button", { name: "Save assessment" }));

  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  const expectedContent: unknown = expect.objectContaining({
    reasoning: "Recovered correction",
    applicationVersion: 1,
    criteriaVersion: 1,
  });
  expect(data.save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "edit",
      id: assessment.id,
      note: "Corrected transcription",
      content: expectedContent,
    }),
    expect.objectContaining({
      revision: application.reviews.revision,
      applicationVersion: application.version,
      criteriaVersion: round.criteriaVersion,
    }),
  );
  await waitFor(async () =>
    expect(await readDraftStorage("dana", "reviews")).not.toHaveProperty(draftKey),
  );
});

it.each(["review", "application", "criteria"] as const)(
  "preserves the draft when the %s version changes and requires an explicit decision to use the new baseline",
  async (changed) => {
    const { user, data, props, rerender } = renderReview({
      availableApplicationVersions: [1, 2, 3].map((version) =>
        materialVersionSchema.parse(version),
      ),
    });
    const form = await openCorrection(user);

    await user.clear(form.getByRole("textbox", { name: "Assessment text" }));
    await user.type(form.getByRole("textbox", { name: "Assessment text" }), "My correction");
    await user.type(form.getByRole("textbox", { name: "Proposed amount" }), "18000");

    const currentApplication = {
      ...application,
      version: materialVersionSchema.parse(application.version + Number(changed === "application")),
      reviews: {
        ...application.reviews,
        requests: [request],
        revision: reviewRevisionSchema.parse(
          application.reviews.revision + Number(changed === "review"),
        ),
      },
    };
    const currentRound = {
      ...round,
      criteriaVersion: criteriaVersionSchema.parse(
        round.criteriaVersion + Number(changed === "criteria"),
      ),
    };
    rerender(<ReviewWork {...props} application={currentApplication} round={currentRound} />);

    const recovery = within(screen.getByRole("complementary", { name: "Review task" }));
    expect(recovery.getByRole("heading", { name: "Review changed" })).toHaveFocus();
    expect(
      within(recovery.getByRole("region", { name: "Saved assessment and your draft" })).getByText(
        "My correction",
      ),
    ).toBeVisible();
    expect(
      recovery.getByRole("region", { name: "Saved assessment and your draft" }),
    ).toHaveTextContent("Local participation.");
    expect(
      recovery.getByRole("region", { name: "Saved assessment and your draft" }),
    ).toHaveTextContent("€18,000");
    expect(recovery.queryByText(request.reviewer)).not.toBeInTheDocument();
    expect(
      recovery.getByText(
        changed === "application"
          ? "Version 2 → Version 3"
          : changed === "criteria"
            ? "Version 1 → Version 2"
            : "Version 3 → Version 4",
      ),
    ).toBeVisible();
    expect(
      recovery.queryByRole("heading", { name: "Reviewer assessments" }),
    ).not.toBeInTheDocument();
    expect(recovery.queryByRole("button", { name: "Save assessment" })).not.toBeInTheDocument();
    expect(recovery.getByRole("alert")).toBeVisible();
    expect(data.save).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Keep my draft" }));
    const resumed = within(screen.getByRole("form", { name: "Edit recorded assessment" }));
    expect(resumed.getByRole("textbox", { name: "Assessment text" })).toHaveValue("My correction");
    await user.click(resumed.getByRole("button", { name: "Save assessment" }));

    const expectedContent: unknown = expect.objectContaining({ reasoning: "My correction" });
    expect(data.save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: "edit",
        content: expectedContent,
      }),
      expect.objectContaining({
        revision: currentApplication.reviews.revision,
        applicationVersion: currentApplication.version,
        criteriaVersion: currentRound.criteriaVersion,
      }),
    );
  },
);

it("preserves incomplete assessment dates and commits calendar selection with the assessment", async () => {
  const { user, data } = renderReview();
  let form = await openCorrection(user);
  await user.type(form.getByRole("textbox", { name: "Assessment date" }), "2027-02-");
  await user.click(form.getByRole("button", { name: "Close" }));
  await user.click(await screen.findByRole("button", { name: "Resume editing" }));
  form = within(screen.getByRole("form", { name: "Edit recorded assessment" }));
  const date = form.getByRole("textbox", { name: "Assessment date" });

  expect(date).toHaveValue("2027-02-");

  await user.click(form.getByRole("button", { name: "Save assessment" }));

  expect(data.save).not.toHaveBeenCalled();
  await waitFor(() => expect(date).toHaveFocus());
  expect(date).toHaveAccessibleDescription(
    "Enter a valid date in YYYY-MM-DD format, within 10 years of the current year.",
  );

  await user.clear(date);
  await user.type(date, "2027-01-21");
  await user.click(form.getByRole("button", { name: "Choose date for Assessment date" }));
  await user.click(await screen.findByRole("button", { name: "Friday, 22 January 2027" }));

  expect(date).toHaveValue("2027-01-22");
  expect(data.save).not.toHaveBeenCalled();

  await user.click(form.getByRole("button", { name: "Save assessment" }));

  const expectedDate: unknown = expect.objectContaining({ date: "2027-01-22" });
  expect(data.save).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ content: expectedDate }),
    expect.objectContaining({ revision: application.reviews.revision }),
  );
});

it.each(["0001-01-01", "9999-12-31"])(
  "preserves an out-of-range assessment date %s and blocks saving",
  async (value) => {
    const { user, data } = renderReview();
    const form = await openCorrection(user);
    const date = form.getByRole("textbox", { name: "Assessment date" });
    await user.type(date, value);
    await user.click(form.getByRole("button", { name: "Save assessment" }));

    expect(data.save).not.toHaveBeenCalled();
    expect(date).toHaveValue(value);
    expect(date).toHaveAccessibleDescription(
      "Enter a valid date in YYYY-MM-DD format, within 10 years of the current year.",
    );
    await waitFor(() => expect(date).toHaveFocus());
  },
);

it("keeps a committed correction distinct from a failed refresh", async () => {
  const { user, data } = renderReview();
  vi.mocked(data.refresh).mockRejectedValue(new Error("Offline"));
  const form = await openCorrection(user);
  await user.click(form.getByRole("button", { name: "Save assessment" }));

  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Saved, but the latest information could not be loaded.",
  );
  await waitFor(async () =>
    expect(await readDraftStorage("dana", "reviews")).not.toHaveProperty(draftKey),
  );
  expect(data.save).toHaveBeenCalledTimes(1);
});

it.each(["cancel", "follow_up"] as const)(
  "retains the refresh warning after %s and retries only the read",
  async (action) => {
    const { user, data, props, rerender } = renderReview({
      application: { ...application, reviews: { ...application.reviews, requests: [request] } },
    });
    vi.mocked(data.refresh).mockRejectedValue(new Error("Offline"));

    await user.click(
      await screen.findByRole("button", {
        name:
          action === "cancel"
            ? `Request actions for ${request.reviewer}`
            : `Assessment actions for ${assessment.reviewer}`,
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", {
        name: action === "cancel" ? "Cancel request" : "Request follow-up",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Saved, but the latest information could not be loaded.",
    );
    expect(data.save).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Saved, but the latest information could not be loaded.",
    );
    vi.mocked(data.refresh).mockImplementation(async () => {
      rerender(
        <ReviewWork
          {...props}
          application={{
            ...props.application,
            reviews: {
              ...props.application.reviews,
              revision: reviewRevisionSchema.parse(application.reviews.revision + 1),
              requests:
                action === "cancel"
                  ? [{ ...request, status: "cancelled" }]
                  : [
                      request,
                      {
                        ...request,
                        id: "eb1f1f75-08ef-5c3e-b184-70a054766f39",
                        contactId: assessment.contactId,
                        reviewer: assessment.reviewer,
                      },
                    ],
            },
          }}
        />,
      );
    });
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    if (action === "cancel") {
      expect(
        screen.queryByRole("button", { name: `Request actions for ${request.reviewer}` }),
      ).not.toBeInTheDocument();
    } else {
      expect(
        screen.getByRole("button", { name: `Request actions for ${assessment.reviewer}` }),
      ).toBeVisible();
    }
    expect(data.save).toHaveBeenCalledTimes(1);
  },
);

it("reports a failed conflict refresh without claiming the correction was saved", async () => {
  const { user, data } = renderReview();
  vi.mocked(data.save).mockResolvedValue({ status: "conflict" });
  vi.mocked(data.refresh).mockRejectedValue(new Error("Offline"));
  const form = await openCorrection(user);

  await user.type(form.getByRole("textbox", { name: "Assessment text" }), " My correction.");
  await user.click(form.getByRole("button", { name: "Save assessment" }));

  expect(form.getByRole("alert")).toHaveTextContent("The saved work changed.");
  expect(
    screen.getByText(
      "The latest information could not be loaded. Try again to review current work.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Saved, but/)).not.toBeInTheDocument();
  expect(await readDraftStorage("dana", "reviews")).toHaveProperty(draftKey);
});

it("adds criterion notes without losing them when the criteria basis changes or the draft is reopened", async () => {
  const { user, data } = renderReview();
  let form = await openCorrection(user);
  await user.click(form.getByRole("button", { name: "Add criterion notes" }));
  const criterion = round.criteria![0]!.title;
  await user.type(form.getByRole("textbox", { name: criterion }), "Strong local participation.");
  await user.click(form.getByRole("button", { name: /Criteria used/ }));
  await user.click(await screen.findByRole("option", { name: "Not known" }));

  expect(form.getByRole("textbox", { name: criterion })).toHaveValue("Strong local participation.");

  await user.click(form.getByRole("button", { name: "Close" }));
  await user.click(await screen.findByRole("button", { name: "Resume editing" }));
  form = within(screen.getByRole("form", { name: "Edit recorded assessment" }));

  expect(form.getByRole("textbox", { name: criterion })).toHaveValue("Strong local participation.");

  await user.click(form.getByRole("button", { name: "Save assessment" }));

  const expectedContent: unknown = expect.objectContaining({
    criteriaVersion: null,
    observations: [
      { criterionId: round.criteria[0]!.id, criterion, text: "Strong local participation." },
    ],
  });
  expect(data.save).toHaveBeenCalledWith(
    expect.objectContaining({ content: expectedContent }),
    expect.anything(),
  );
});

it("rejects excess typed and pasted precision without rounding a recorded assessment amount", async () => {
  const { user } = renderReview();
  const form = await openCorrection(user);
  const amount = form.getByRole("textbox", { name: "Proposed amount" });
  await user.type(amount, "123.456");
  expect(amount).toHaveValue("123.45");
  expect(amount).toHaveAccessibleDescription(/Use numbers with up to two decimal places/);
  await user.clear(amount);
  await user.paste("99.999");
  expect(amount).toHaveValue("");
  expect(amount).toHaveAccessibleDescription(/Use numbers with up to two decimal places/);
  await user.paste("12,50");
  await user.tab();
  expect(amount).toHaveValue("12.50");
});

it("preserves invalid restored assessment amounts and blocks saving without rounding", async () => {
  await seedDraftStorage("dana", "reviews", {
    [draftKey]: {
      mode: "edit",
      id: assessment.id,
      revision: application.reviews.revision,
      applicationVersion: application.version,
      criteriaVersion: round.criteriaVersion,
      values: {
        contactId: assessment.contactId,
        applicationVersion: "1",
        criteriaVersion: "1",
        date: "",
        position: "Fund",
        amount: "123.456",
        reasoning: "Recovered correction",
        observations: [],
        note: "",
      },
    },
  });
  const { user, data } = renderReview();
  await user.click(await screen.findByRole("button", { name: "Resume editing" }));
  const form = within(screen.getByRole("form", { name: "Edit recorded assessment" }));
  const amount = form.getByRole("textbox", { name: "Proposed amount" });
  await user.click(amount);
  await user.tab();
  await user.click(form.getByRole("button", { name: "Save assessment" }));
  expect(amount).toHaveValue("123.456");
  expect(amount).toHaveAttribute("aria-invalid", "true");
  expect(data.save).not.toHaveBeenCalled();
});

const seedConflictingReview = (mode: "record" | "edit", contactId: string, date = "") =>
  seedDraftStorage("dana", "reviews", {
    [draftKey]: {
      mode,
      id: mode === "edit" ? assessment.id : crypto.randomUUID(),
      revision: application.reviews.revision - 1,
      applicationVersion: application.version,
      criteriaVersion: round.criteriaVersion,
      values: {
        contactId,
        applicationVersion: "1",
        criteriaVersion: "1",
        date,
        position: "Fund",
        amount: "18000",
        reasoning: "Preserved judgment.",
        observations: [],
        note: "Preserved change note.",
      },
    },
  });

it.each([
  { mode: "record", date: "2027-01-20", expected: "20 January 2027" },
  { mode: "edit", date: "", expected: "Not known" },
  { mode: "record", date: "invalid restored date", expected: "invalid restored date" },
] as const)(
  "identifies a conflicting $mode draft and preserves its date ($date)",
  async ({ mode, date, expected }) => {
    await seedConflictingReview(mode, assessment.contactId, date);
    const { user, data } = renderReview();
    await user.click(await screen.findByRole("button", { name: "Resume editing" }));
    const draft = within(screen.getByRole("region", { name: "Saved assessment and your draft" }));
    expect(
      draft.getByText("Reviewer", { selector: "dt" }).parentElement?.lastElementChild,
    ).toHaveTextContent(assessment.reviewer);
    expect(draft.getByText("Assessment date")).toBeVisible();
    expect(
      draft.getByText("Assessment date", { selector: "dt" }).parentElement?.lastElementChild,
    ).toHaveTextContent(expected);
    expect(draft.getByText("Preserved judgment.")).toBeVisible();
    expect(draft.getByText("Preserved change note.")).toBeVisible();
    expect(data.save).not.toHaveBeenCalled();
  },
);

it("resolves the newly selected reviewer in a conflicting assessment draft before a resolution", async () => {
  await seedConflictingReview("record", "new-reviewer");
  let resolveContacts!: (value: Awaited<ReturnType<ContactsSource["read"]>>) => void;
  const source: ContactsSource = {
    scope: (workspace) => [workspace],
    read: vi.fn<ContactsSource["read"]>(
      () =>
        new Promise((resolve) => {
          resolveContacts = resolve;
        }),
    ),
    save: vi.fn(),
  };
  const { user, data } = renderReview({}, "dana", source);
  await user.click(await screen.findByRole("button", { name: "Resume editing" }));
  const draft = within(screen.getByRole("region", { name: "Saved assessment and your draft" }));
  expect(draft.getByText("Reviewer details unavailable")).toBeVisible();
  await act(async () =>
    resolveContacts({
      status: "ok",
      workspaceName: "Alder",
      contacts: [
        {
          id: "new-reviewer",
          name: "New Reviewer",
          email: "new@example.test",
          affiliation: "",
          archived: false,
          revision: 0,
          applicationTitles: [],
        },
      ],
    }),
  );
  expect(await draft.findByText("New Reviewer", { exact: true })).toBeVisible();
  expect(draft.queryByText("Reviewer details unavailable")).not.toBeInTheDocument();
  expect(draft.getByText("Assessment date")).toBeVisible();
  expect(draft.getByText("€18,000")).toBeVisible();
  expect(data.save).not.toHaveBeenCalled();
});

it.each([
  { contactId: "missing-reviewer", expected: "Reviewer details unavailable" },
  { contactId: "", expected: "No reviewer selected" },
])(
  "truthfully identifies an unavailable assessment draft selection ($contactId)",
  async ({ contactId, expected }) => {
    await seedConflictingReview("record", contactId);
    const source: ContactsSource = {
      scope: (workspace) => [workspace],
      read: vi.fn().mockResolvedValue({ status: "ok", workspaceName: "Alder", contacts: [] }),
      save: vi.fn(),
    };
    const { user, data } = renderReview({}, "dana", source);
    await user.click(await screen.findByRole("button", { name: "Resume editing" }));
    const draft = within(screen.getByRole("region", { name: "Saved assessment and your draft" }));
    expect(draft.getByText(expected)).toBeVisible();
    expect(draft.queryByText(assessment.reviewer)).not.toBeInTheDocument();
    expect(data.save).not.toHaveBeenCalled();
  },
);

it("keeps reference focus when a delayed assessment save completes", async () => {
  const { user, data } = renderReview();
  let finish!: (result: Awaited<ReturnType<ReviewData["save"]>>) => void;
  vi.mocked(data.save).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const form = await openCorrection(user);
  await user.click(form.getByRole("button", { name: "Save assessment" }));
  const details = screen.getByRole("button", { name: "Review details" });
  details.focus();
  await act(async () => finish({ status: "ok", revision: reviewRevisionSchema.parse(4) }));
  await waitFor(() =>
    expect(
      screen.queryByRole("form", { name: "Edit recorded assessment" }),
    ).not.toBeInTheDocument(),
  );
  await act(async () => {
    await new Promise(requestAnimationFrame);
  });
  expect(details).toHaveFocus();
});

it("keeps reference focus when current context changes and restores writing after explicit conflict resolution", async () => {
  const { user, props, rerender } = renderReview();
  const form = await openCorrection(user);
  await user.type(form.getByRole("textbox", { name: "Assessment text" }), "Preserved writing");
  const reference = screen.getByRole("button", { name: "Review details" });
  reference.focus();
  rerender(
    <ReviewWork
      {...props}
      application={{ ...application, version: materialVersionSchema.parse(3) }}
    />,
  );
  expect(screen.getByRole("region", { name: "Saved assessment and your draft" })).toBeVisible();
  expect(reference).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Keep my draft" }));
  expect(screen.getByRole("textbox", { name: "Assessment text" })).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Assessment text" })).toHaveValue(
    "Local participation.Preserved writing",
  );
});
it("compares a retained assessment against that assessment without borrowing request attribution", async () => {
  await seedConflictingReview("record", assessment.contactId);
  const earlier = {
    ...assessment,
    versions: [
      {
        ...assessment.versions[0]!,
        recorder: {
          userId: "wrong",
          name: "Assessment Recorder",
          recordedAt: "2027-01-01T10:00:00Z",
        },
      },
    ],
  };
  const requested = {
    ...request,
    contactId: assessment.contactId,
    reviewer: assessment.reviewer,
    applicationVersion: application.version,
    criteriaVersion: round.criteriaVersion,
    recorder: { userId: "right", name: "Request Recorder", recordedAt: "2027-01-02T11:00:00Z" },
  };
  const { user } = renderReview({
    application: {
      ...application,
      reviews: { ...application.reviews, assessments: [earlier], requests: [requested] },
    },
  });
  await user.click(await screen.findByRole("button", { name: "Resume editing" }));
  const comparison = within(
    screen.getByRole("region", { name: "Saved assessment and your draft" }),
  );
  expect(comparison.getByText(/Recorded by Assessment Recorder/)).toBeVisible();
  expect(comparison.queryByText(/Request Recorder/)).not.toBeInTheDocument();
  expect(comparison.queryByText(/vnull/)).not.toBeInTheDocument();
  expect(
    comparison.getByText("Application material reviewed", { selector: "dt" }).nextElementSibling,
  ).toHaveTextContent("Version 1");
  expect(
    comparison.getByText("Criteria used", { selector: "dt" }).nextElementSibling,
  ).toHaveTextContent("Version 1");
});

it("loads assignments independently of the management view before allowing manual recording", async () => {
  let finish!: (value: Awaited<ReturnType<ManagerReviewerData["read"]>>) => void;
  const participation: ManagerReviewerData = {
    read: vi.fn<ManagerReviewerData["read"]>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
    invite: vi.fn(),
    manage: vi.fn(),
    refresh: vi.fn(),
  };
  const { user } = renderReview({
    application: { ...application, reviews: { ...application.reviews, requests: [request] } },
    data: { draftKey, workspaceSlug: "alder", participation, save: vi.fn(), refresh: vi.fn() },
  });
  const pending = within(screen.getByRole("article", { name: request.reviewer }));
  expect(pending.getByRole("button", { name: "Record assessment" })).toBeDisabled();
  expect(screen.queryByRole("region", { name: "Reviewer access" })).not.toBeInTheDocument();
  await act(async () =>
    finish({ status: "ok", value: [{ ...reviewerPage().assignment, requestId: request.id }] }),
  );
  expect(pending.queryByRole("button", { name: "Record assessment" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Manage reviews" }));
  expect(await screen.findByText("sam@example.test")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Close review task" }));
  await user.click(screen.getByRole("button", { name: "Manage reviews" }));
  expect(participation.read).toHaveBeenCalledTimes(1);
});
