import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ResourceLanguage } from "i18next";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import type { IntakeData, IntakeState } from "@merit/applications-web/contracts";
import { ApplicationIntake, type IntakeSession } from "@merit/applications-web/work";
import { prepareIntakeChange } from "@merit/applications/domain";
import { roundView, applicationView } from "@merit/grantmaking/api";
import { makeApplication, makeReviewRequest, makeRound } from "@merit/grantmaking/testing/fixtures";
import { MessagesProvider } from "@merit/i18n";
import { fromMinorUnits } from "@merit/money";
import { createQueryClient } from "@merit/query";

import { grantmakingMessages } from "../../messages";
import { ApplicationView } from "../applications/application-view";
import { GrantmakingDrafts } from "../drafts";

vi.mock("@merit/contacts-web/contacts", () => ({ ContactPicker: () => null }));

const round = roundView(makeRound());
const original = applicationView(
  makeApplication({
    title: "Workshop Saturdays",
    version: 2,
    intakeStatus: "ready",
    requested: fromMinorUnits(2200000n),
    summary: "Staff interpretation of the application.",
    submission: {
      version: 2,
      organization: "Repair Collective",
      contact: "Sam",
      contactEmail: "sam@example.test",
      answers: [
        {
          questionId: "9e8cdd06-b965-551e-938f-43d2df580864",
          question: "Purpose",
          response: "Weekly repairs.",
        },
        {
          questionId: "9e176e0d-d37a-57ac-9497-1c08dbc65f03",
          question: "Delivery",
          response: "Volunteer workshops.",
        },
      ],
    },
  }),
);

const renderIntake = (
  refresh = vi.fn<IntakeData["refresh"]>().mockResolvedValue(undefined),
  storageScope?: string,
  messages: ResourceLanguage = grantmakingMessages,
  base = original,
) => {
  const calls = vi.fn<IntakeData["save"]>();

  const Harness = () => {
    const [application, setApplication] = useState(base);
    const [intake, setIntake] = useState<IntakeState>({
      revision: 0,
      workingRevision: null,
      history: [],
    });

    calls.mockImplementation(async (change, revision) => {
      if (revision !== intake.revision) {
        return { status: "conflict" };
      }

      const result = prepareIntakeChange(
        application,
        intake.workingRevision,
        change,
        {
          userId: "dana",
          name: "Dana Reed",
          recordedAt: "2027-01-20T12:00:00Z",
        },
        {
          hasReviews: Boolean(
            application.reviews.requests.length || application.reviews.assessments.length,
          ),
          hasRecommendation: application.managerRecommendation !== null,
        },
      );
      if (!result.ok) {
        return { status: "invalid", error: result.error };
      }

      // Reinstatement omits `withdrawal`, so it must not survive from the previous record.
      const { withdrawal: _withdrawal, ...current } = application;
      setApplication(
        roundView({ ...round, applications: [{ ...current, ...result.application }] })
          .applications[0]!,
      );
      setIntake({ ...intake, revision: revision + 1, workingRevision: result.workingRevision });
      return { status: "ok", revision: revision + 1 };
    });
    const session: IntakeSession = {
      data: {
        draftKey: "test-application",
        workspaceSlug: "alder",
        publicId: "b8q3w5j7c2df",
        state: intake,
        save: calls,
        refresh,
        refreshCurrent: async () => {},
      },
      onDeleted: async () => {},
    };

    return (
      <ApplicationView
        application={application}
        round={round}
        intakeState={intake}
        intake={session}
      />
    );
  };

  const rendered = render(
    <QueryClientProvider client={createQueryClient()}>
      <MessagesProvider messages={messages}>
        <GrantmakingDrafts storageScope={storageScope}>
          <Harness />
        </GrantmakingDrafts>
      </MessagesProvider>
    </QueryClientProvider>,
  );

  return { calls, user: userEvent.setup(), unmount: rendered.unmount };
};

it.each([true, false])("presents read-only intake with recorded material: %s", (hasMaterial) => {
  const application = {
    ...original,
    summary: hasMaterial ? original.summary : "",
    summaryAuthor: { userId: "dana", name: "Dana Reed", recordedAt: "2027-01-20T12:00:00Z" },
    submission: hasMaterial ? original.submission : undefined,
  };
  render(
    <MessagesProvider messages={grantmakingMessages}>
      <ApplicationIntake application={application} onReveal={vi.fn()}>
        {({ title, overview, evidence, feedback }) => (
          <>
            <h1>{title}</h1>
            {overview}
            {evidence}
            {feedback}
          </>
        )}
      </ApplicationIntake>
    </MessagesProvider>,
  );

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(original.title);
  expect(screen.getByRole("heading", { name: "Applicant submission" })).toBeVisible();
  expect(screen.getByText("Version 2")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  if (hasMaterial) {
    const summary = screen.getByRole("region", { name: "Staff summary" });
    expect(summary).toHaveTextContent(original.summary);
    expect(summary).toHaveTextContent("Dana Reed");
    expect(screen.getByRole("heading", { name: "Purpose" })).toBeVisible();
    expect(screen.getByText("Weekly repairs.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Delivery" })).toBeVisible();
    expect(screen.getByText("Volunteer workshops.")).toBeVisible();
  } else {
    expect(screen.queryByRole("region", { name: "Staff summary" })).not.toBeInTheDocument();
    expect(screen.queryByText("Dana Reed")).not.toBeInTheDocument();
    expect(screen.getByText(grantmakingMessages.fundingRounds.evidence.unavailable)).toBeVisible();
  }
});

it("translates the requested-amount rule and permits a corrected draft", async () => {
  const { user, calls } = renderIntake(undefined, undefined, {
    ...grantmakingMessages,
    applicationIntake: {
      ...grantmakingMessages.applicationIntake,
      intake: {
        ...grantmakingMessages.applicationIntake.intake,
        amountInvalid: "Translated amount rule",
      },
    },
  });
  await user.click(await screen.findByRole("button", { name: "Application actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Start revised submission" }));
  await user.click(await screen.findByRole("button", { name: "Edit application details" }));
  calls.mockClear();
  const amount = await screen.findByRole("textbox", { name: "Requested amount" });
  fireEvent.change(amount, { target: { value: "-1" } });
  await user.click(await screen.findByRole("button", { name: "Save working revision" }));

  expect(amount).toHaveAccessibleDescription("Translated amount rule Euros");
  expect(amount).toHaveValue("-1");
  expect(calls).not.toHaveBeenCalled();

  fireEvent.change(amount, { target: { value: "29000.50" } });
  fireEvent.change(screen.getByRole("textbox", { name: "What changed and why" }), {
    target: { value: "Updated costs" },
  });
  await user.click(await screen.findByRole("button", { name: "Save working revision" }));

  expect(calls).toHaveBeenCalledOnce();
  expect(calls.mock.calls[0]?.[0]).toMatchObject({
    action: "save_revision",
    draft: { content: { requested: "29000.50" } },
  });
});

it("retains a committed action's refresh warning and retries the read without repeating the write", async () => {
  const refresh = vi
    .fn<IntakeData["refresh"]>()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockRejectedValueOnce(new Error("Still offline"))
    .mockResolvedValue(undefined);
  const { user, calls } = renderIntake(refresh);
  await user.click(await screen.findByRole("button", { name: "Application actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Start revised submission" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Your change was saved");

  await user.click(await screen.findByRole("button", { name: "Refresh application" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Your change was saved");

  await user.click(await screen.findByRole("button", { name: "Refresh application" }));

  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(refresh).toHaveBeenCalledTimes(3);
  expect(calls).toHaveBeenCalledTimes(1);
});

it("keeps an inline submitted title change in a correction until it is explained and recorded", async () => {
  const { user, calls } = renderIntake();
  await user.click(await screen.findByRole("button", { name: "View version history" }));
  await user.click(await screen.findByRole("button", { name: original.title }));
  const title = screen.getByRole("textbox", { name: "Correct application title" });
  await user.clear(title);
  await user.type(title, "Workshop Saturdays — repair sessions");
  await user.keyboard("{Enter}");

  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Project title" })).toHaveValue(
      "Workshop Saturdays — repair sessions",
    ),
  );
  expect(screen.queryByRole("textbox", { name: "Applicant" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Requested amount" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Applicant’s response" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(original.title);
  expect(screen.queryByRole("button", { name: "Record revision" })).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole("textbox", { name: "What changed and why" }), {
    target: { value: "Use the applicant's corrected project title." },
  });
  await user.click(await screen.findByRole("button", { name: "Save working revision" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Record revision" })).toBeEnabled(),
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(original.title);

  await user.click(await screen.findByRole("button", { name: "Record revision" }));

  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Workshop Saturdays — repair sessions",
    ),
  );
  expect(calls.mock.calls.map(([change]) => change.action)).toEqual([
    "start_revision",
    "save_revision",
    "publish_revision",
  ]);
});

it("edits the summary inline with the standard field and preserves contact details", async () => {
  const { user, calls } = renderIntake();

  expect(screen.queryByText("Application history")).not.toBeInTheDocument();

  await user.click(await screen.findByRole("button", { name: "Edit summary" }));
  const field = screen.getByRole("textbox", { name: "Staff summary" });

  expect(field.closest("[data-appearance]")).toHaveAttribute("data-appearance", "default");
  expect(screen.queryByRole("heading", { name: "Staff summary" })).not.toBeInTheDocument();

  fireEvent.change(field, { target: { value: "Updated staff interpretation." } });
  await user.click(await screen.findByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(calls).toHaveBeenCalledWith(
      {
        action: "details",
        summary: "Updated staff interpretation.",
      },
      0,
    ),
  );
});

it("brings a newly started revision into view from application management", async () => {
  const { user } = renderIntake();
  await user.click(await screen.findByRole("button", { name: "Application actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Start revised submission" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Edit applicant submission" })).toBeVisible(),
  );
  expect(screen.getByRole("region", { name: "Applicant submission" })).toBeVisible();

  await user.click(await screen.findByRole("button", { name: "View version history" }));

  await waitFor(() =>
    expect(screen.getAllByRole("heading", { name: "Version history" })[0]).toHaveFocus(),
  );

  await user.click(await screen.findByRole("button", { name: "Back to application" }));
  await user.click(await screen.findByRole("button", { name: "Edit applicant submission" }));

  expect(screen.getByRole("form", { name: "Edit applicant submission" })).toBeVisible();
});

it("keeps unsaved revision edits while consulting the current submission", async () => {
  const { user, calls } = renderIntake();
  await user.click(await screen.findByRole("button", { name: "Application actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Start revised submission" }));
  await user.click(await screen.findByRole("button", { name: "Edit application details" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Requested amount" }), {
    target: { value: "29000" },
  });
  await user.click(await screen.findByRole("button", { name: "View current submission" }));
  const preview = screen.getByRole("dialog", { name: "Current submission" });

  expect(within(preview).getByRole("heading", { name: original.title })).toBeVisible();
  expect(preview).toHaveTextContent("€22,000");
  expect(preview).not.toHaveTextContent("€29,000");

  await user.click(within(preview).getByRole("button", { name: /^Close$/ }));

  expect(screen.getByRole("textbox", { name: "Requested amount" })).toHaveValue("29000");

  await user.click(await screen.findByRole("button", { name: /^Close$/ }));

  expect(screen.getByRole("button", { name: "Record revision" })).toBeDisabled();

  await user.click(
    await screen.findByRole("button", { name: "Continue editing application details" }),
  );

  expect(screen.getByRole("textbox", { name: "Requested amount" })).toHaveValue("29000");
  expect(calls.mock.calls.map(([change]) => change.action)).toEqual(["start_revision"]);
});

it("saves details independently and reconciles preserved submission writing before its next save", async () => {
  const { user, calls } = renderIntake();
  await user.click(await screen.findByRole("button", { name: "Application actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Start revised submission" }));
  await user.click(await screen.findByRole("button", { name: "Edit applicant submission" }));
  const response = screen.getAllByRole("textbox", { name: "Applicant’s response" })[0]!;
  fireEvent.change(response, { target: { value: "Unfinished local writing" } });
  await user.click(await screen.findByRole("button", { name: /^Close$/ }));
  await user.click(await screen.findByRole("button", { name: "Edit application details" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Requested amount" }), {
    target: { value: "29000" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "What changed and why" }), {
    target: { value: "Revised costs and plan" },
  });
  await user.click(await screen.findByRole("button", { name: "Save working revision" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Record revision" })).toBeDisabled(),
  );
  expect(calls.mock.calls.at(-1)?.[0]).toMatchObject({
    action: "save_revision",
    draft: {
      content: { requested: "29000" },
      reason: "Revised costs and plan",
    },
  });

  await user.click(
    await screen.findByRole("button", { name: "Continue editing applicant submission" }),
  );

  expect(screen.getAllByRole("textbox", { name: "Applicant’s response" })[0]).toHaveValue(
    "Unfinished local writing",
  );
  expect(screen.getByRole("button", { name: "Save working revision" })).toBeDisabled();

  await user.click(await screen.findByRole("button", { name: "Keep my changes" }));

  expect(screen.getByRole("textbox", { name: "What changed and why" })).toHaveValue(
    "Revised costs and plan",
  );

  await user.click(await screen.findByRole("button", { name: "Save working revision" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Record revision" })).toBeEnabled(),
  );
  expect(calls.mock.calls.at(-1)?.[0]).toMatchObject({
    action: "save_revision",
    draft: {
      content: {
        answers: [
          expect.objectContaining({ response: "Unfinished local writing" }),
          ...original.submission!.answers.slice(1),
        ],
      },
    },
  });
});

it("discards one editor while keeping another section's draft", async () => {
  const { user, calls } = renderIntake();
  await user.click(await screen.findByRole("button", { name: "Application actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Start revised submission" }));
  await user.click(await screen.findByRole("button", { name: "Edit applicant submission" }));
  fireEvent.change((await screen.findAllByRole("textbox", { name: "Applicant’s response" }))[0]!, {
    target: { value: "Keep this writing" },
  });
  await user.click(await screen.findByRole("button", { name: /^Close$/ }));
  await user.click(await screen.findByRole("button", { name: "Edit application details" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Requested amount" }), {
    target: { value: "99999" },
  });
  await user.click(await screen.findByRole("button", { name: "Discard changes" }));
  await user.click(await screen.findByRole("button", { name: "Edit application details" }));

  expect(await screen.findByRole("textbox", { name: "Requested amount" })).toHaveValue("22000.00");

  await user.click(await screen.findByRole("button", { name: /^Close$/ }));
  await user.click(
    await screen.findByRole("button", { name: "Continue editing applicant submission" }),
  );

  expect((await screen.findAllByRole("textbox", { name: "Applicant’s response" }))[0]).toHaveValue(
    "Keep this writing",
  );
  expect(calls).toHaveBeenCalledTimes(1);
});

it("recovers section drafts after remounting in the same account scope", async () => {
  const scope = "intake-recovery-test";
  const first = renderIntake(undefined, scope);
  await first.user.click(await screen.findByRole("button", { name: "Edit summary" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Staff summary" }), {
    target: { value: "Unfinished summary across reload" },
  });
  first.unmount();
  const second = renderIntake(undefined, scope);
  await second.user.click(await screen.findByRole("button", { name: "Continue editing summary" }));

  expect(await screen.findByRole("textbox", { name: "Staff summary" })).toHaveValue(
    "Unfinished summary across reload",
  );
  expect(second.calls).not.toHaveBeenCalled();

  second.unmount();
});

it("preserves a title correction when the committed start cannot refresh", async () => {
  const refresh = vi.fn<IntakeData["refresh"]>().mockRejectedValue(new Error("Offline"));
  const { user, calls } = renderIntake(refresh);
  await user.click(await screen.findByRole("button", { name: original.title }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Correct application title" }), {
    target: { value: "Recovered correction" },
  });
  await user.keyboard("{Enter}");

  expect(await screen.findByRole("textbox", { name: "Project title" })).toHaveValue(
    "Recovered correction",
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Your change was saved");
  expect(calls).toHaveBeenCalledTimes(1);
});

const outstandingRequest = (id: string) =>
  makeReviewRequest({ id, contactId: `contact-${id}`, reviewer: `Reviewer ${id}` });

const openWithdrawal = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: "Application actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Withdraw application" }));
  return screen.findByRole("dialog", { name: "Withdraw application: Workshop Saturdays" });
};

it("withdraws with a date and reason, then offers only reinstatement while the case is read-only", async () => {
  const { user, calls } = renderIntake();
  expect(screen.getByRole("button", { name: "Edit summary" })).toBeVisible();
  const dialog = within(await openWithdrawal(user));

  // The dialog explains what is kept, and omits the review sentence when nothing is outstanding.
  expect(
    dialog.getByText(/The application, its material, reviews, and recommendation are kept/),
  ).toBeVisible();
  expect(dialog.getByText(/Withdrawal is not a rejection/)).toBeVisible();
  expect(dialog.queryByText(/outstanding review request/)).not.toBeInTheDocument();
  expect(dialog.getByText(/Withdrawal is not a rejection\.$/)).toBeVisible();
  expect(dialog.getByRole("textbox", { name: /Withdrawal date/ })).toHaveValue(
    new Date().toLocaleDateString("sv"),
  );

  await user.click(dialog.getByRole("button", { name: "Withdraw application" }));
  expect(dialog.getByText("Enter the reason for withdrawing.")).toBeVisible();
  expect(calls).not.toHaveBeenCalled();

  const date = dialog.getByRole("textbox", { name: /Withdrawal date/ });
  await user.clear(date);
  await user.type(date, "2020-03-04");
  await user.type(
    dialog.getByRole("textbox", { name: /Reason/ }),
    "  The applicant found other funding.  ",
  );
  await user.click(dialog.getByRole("button", { name: "Withdraw application" }));

  await waitFor(() => expect(calls).toHaveBeenCalledOnce());
  expect(calls).toHaveBeenCalledWith(
    {
      action: "withdraw",
      withdrawnOn: "2020-03-04",
      reason: "The applicant found other funding.",
    },
    0,
  );
  expect(await screen.findByRole("button", { name: "Reinstate application" })).toBeVisible();
  expect(screen.getByText("Withdrawn")).toBeVisible();
  expect(screen.getByText("Withdrawn on 4 March 2020")).toBeVisible();
  expect(screen.getByText("Recorded by Dana Reed")).toBeVisible();
  expect(screen.getByText("The applicant found other funding.")).toBeVisible();
  expect(screen.queryByText("Ready for review")).not.toBeInTheDocument();

  // Every edit affordance is gone; the content stays readable.
  for (const name of [
    "Edit applicant submission",
    "Edit application details",
    "Edit summary",
    "Mark ready for review",
  ]) {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  }
  expect(screen.queryByRole("button", { name: "Rename application" })).not.toBeInTheDocument();
  expect(screen.getByText("Weekly repairs.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Application actions" }));
  expect(screen.queryByRole("menuitem", { name: "Withdraw application" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("menuitem", { name: "Start revised submission" }),
  ).not.toBeInTheDocument();
  await user.keyboard("{Escape}");

  await user.click(screen.getByRole("button", { name: "Reinstate application" }));
  const reinstate = within(
    await screen.findByRole("dialog", { name: "Reinstate application: Workshop Saturdays" }),
  );
  expect(reinstate.getByText(/Review requests closed by the withdrawal stay closed/)).toBeVisible();
  expect(reinstate.queryByRole("textbox", { name: /Withdrawal date/ })).not.toBeInTheDocument();
  await user.click(reinstate.getByRole("button", { name: "Reinstate application" }));
  expect(reinstate.getByText("Enter the reason for reinstating.")).toBeVisible();
  expect(calls).toHaveBeenCalledOnce();

  await user.type(reinstate.getByRole("textbox", { name: /Reason/ }), "The applicant returned.");
  await user.click(reinstate.getByRole("button", { name: "Reinstate application" }));

  await waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
  expect(calls).toHaveBeenLastCalledWith(
    { action: "reinstate", reason: "The applicant returned." },
    1,
  );
  expect(await screen.findByRole("button", { name: "Edit summary" })).toBeVisible();
  expect(screen.queryByText("Withdrawn")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Application actions" }));
  expect(await screen.findByRole("menuitem", { name: "Withdraw application" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "Start revised submission" })).toBeVisible();
});

it("states how many outstanding review requests will close", async () => {
  const withRequests = applicationView({
    ...original,
    reviews: {
      ...original.reviews,
      requests: [outstandingRequest("one"), outstandingRequest("two")],
    },
  });
  const { user } = renderIntake(undefined, undefined, undefined, withRequests);

  expect(await openWithdrawal(user)).toHaveAccessibleDescription(
    /Withdrawal is not a rejection\. 2 outstanding review requests will close, and their reviewers’ access will end\./,
  );
});

it("rejects a future withdrawal date before sending", async () => {
  const { user, calls } = renderIntake();
  const dialog = within(await openWithdrawal(user));
  const date = dialog.getByRole("textbox", { name: /Withdrawal date/ });
  await user.clear(date);
  await user.type(date, "9999-12-31");
  await user.type(dialog.getByRole("textbox", { name: /Reason/ }), "Stepped back");
  await user.click(dialog.getByRole("button", { name: "Withdraw application" }));

  expect(dialog.getByText("The withdrawal date cannot be in the future.")).toBeVisible();
  expect(calls).not.toHaveBeenCalled();
});

it("keeps the dialog open with the failure, and with the revision seen when it opened", async () => {
  const { user, calls } = renderIntake();
  const dialog = within(await openWithdrawal(user));
  calls.mockResolvedValueOnce({ status: "invalid", error: "application_in_use" });
  await user.type(dialog.getByRole("textbox", { name: /Reason/ }), "Stepped back");
  await user.click(dialog.getByRole("button", { name: "Withdraw application" }));

  await waitFor(() => expect(calls).toHaveBeenCalledOnce());
  expect(await dialog.findByRole("alert")).toHaveTextContent(/can be deleted/);
  expect(dialog.getByRole("textbox", { name: /Reason/ })).toHaveValue("Stepped back");

  calls.mockResolvedValueOnce({ status: "conflict" });
  await user.click(dialog.getByRole("button", { name: "Withdraw application" }));
  await waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
  expect(await dialog.findByText(/This application has changed\. Close this dialog/)).toBeVisible();
  expect(calls.mock.calls.map((call) => call[1])).toEqual([0, 0]);
});
