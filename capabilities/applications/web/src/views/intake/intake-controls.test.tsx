import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vite-plus/test";

import { intakeContent } from "@merit/applications/domain";
import { applicationView } from "@merit/grantmaking/api";
import { makeApplication } from "@merit/grantmaking/testing/fixtures";

import { GrantmakingMessagesProvider } from "../../testing/providers";
import { IntakeControls } from "./application-intake";

const application = applicationView(makeApplication());
const revision = {
  kind: "revision" as const,
  content: intakeContent(application),
  reason: "Updated project plan",
};
const states = [
  {
    name: "preparation",
    heading: "Applicant submission",
    badge: "In preparation",
    action: "Mark ready for review",
    command: "markReady",
    workingRevision: null,
  },
  {
    name: "ready",
    heading: "Applicant submission",
    badge: "Ready for review",
    action: null,
    command: null,
    workingRevision: null,
  },
  {
    name: "revision",
    heading: "Applicant submission",
    badge: null,
    action: "Record revision",
    command: "publishRevision",
    workingRevision: revision,
  },
  {
    name: "correction",
    heading: "Applicant submission",
    badge: null,
    action: "Record revision",
    command: "publishRevision",
    workingRevision: { ...revision, kind: "correction" },
  },
] as const;

const renderControls = (state: (typeof states)[number]) => {
  const intake: ComponentProps<typeof IntakeControls>["intake"] = {
    confirmation: null,
    error: null,
    ready: true,
    application: {
      ...application,
      intakeStatus: state.name === "preparation" ? "in_preparation" : "ready",
    },
    withdrawn: false,
    setConfirmation: vi.fn(),
    preparing: state.name === "preparation",
    workingRevision: state.workingRevision,
    section: null,
    unsavedContent: false,
    missingFields: [],
    pending: false,
    markReady: vi.fn().mockResolvedValue(null),
    publishRevision: vi.fn().mockResolvedValue(null),
  };
  const { rerender } = render(<IntakeControls intake={intake} />, {
    wrapper: GrantmakingMessagesProvider,
  });
  return {
    intake,
    user: userEvent.setup(),
    update: (changes: Partial<typeof intake>) =>
      rerender(<IntakeControls intake={{ ...intake, ...changes }} />),
  };
};

const statusBadges = () =>
  screen
    .queryAllByText(/^(In preparation|Ready for review|Unsaved edits)$/)
    .map((node) => node.textContent);

it.each(states)("keeps $name status visible while its action is pending", async (state) => {
  const { intake, user, update } = renderControls(state);
  expect(screen.getByRole("heading", { name: state.heading })).toBeVisible();
  expect(statusBadges()).toEqual(state.badge ? [state.badge] : []);
  if (!state.action) {
    expect(
      screen.queryByRole("button", { name: "Start revised submission" }),
    ).not.toBeInTheDocument();
    return;
  }
  const action = screen.getByRole("button", { name: state.action });
  expect(action).toBeEnabled();
  await user.click(action);
  expect(intake[state.command]).toHaveBeenCalledOnce();

  update({ pending: true });
  expect(action).toBeDisabled();
  expect(screen.getByRole("heading", { name: state.heading })).toBeVisible();
  expect(statusBadges()).toEqual(state.badge ? [state.badge] : []);
  await user.click(action);
  expect(intake[state.command]).toHaveBeenCalledOnce();
});

it.each(states.filter((state) => state.name !== "ready"))(
  "distinguishes unsaved $name edits and prevents committing them",
  async (state) => {
    const { intake, user, update } = renderControls(state);
    update({ unsavedContent: true });
    expect(screen.getByRole("heading", { name: state.heading })).toBeVisible();
    expect(statusBadges()).toEqual([...(state.badge ? [state.badge] : []), "Unsaved edits"]);
    const action = screen.getByRole("button", { name: state.action });
    expect(action).toBeDisabled();
    expect(screen.getByText(/Save or discard your unsaved application edits/)).toBeVisible();
    await user.click(action);
    expect(intake[state.command]).not.toHaveBeenCalled();

    update({ unsavedContent: true, section: "content" });
    expect(screen.queryByRole("button", { name: state.action })).not.toBeInTheDocument();
    expect(statusBadges()).toEqual([...(state.badge ? [state.badge] : []), "Unsaved edits"]);

    update({ section: "details" });
    expect(screen.getByRole("button", { name: state.action })).toBeEnabled();
    expect(statusBadges()).toEqual(state.badge ? [state.badge] : []);
  },
);

it("keeps missing-field guidance beside the disabled readiness action", async () => {
  const { intake, user, update } = renderControls(states[0]);
  update({ missingFields: ["applicant", "requested", "answers"] });
  expect(
    screen.getByText(
      "Before marking ready, complete: Applicant, Requested amount, Submitted material.",
    ),
  ).toBeVisible();
  expect(statusBadges()).toEqual(["In preparation"]);
  const action = screen.getByRole("button", { name: "Mark ready for review" });
  expect(action).toBeDisabled();
  await user.click(action);
  expect(intake.markReady).not.toHaveBeenCalled();

  update({ missingFields: [] });
  expect(screen.queryByText(/Before marking ready/)).not.toBeInTheDocument();
  expect(action).toBeEnabled();
});

it("shows the withdrawal facts and offers only reinstatement while withdrawn", async () => {
  const reason = "The applicant secured funding elsewhere and asked us to stop.";
  const setConfirmation = vi.fn();
  render(
    <IntakeControls
      intake={{
        confirmation: null,
        error: null,
        ready: true,
        application: {
          ...application,
          intakeStatus: "ready",
          withdrawal: {
            withdrawnOn: "2027-02-03",
            reason,
            recorder: { userId: "manager", name: "Dana Reed", recordedAt: "2027-02-04T09:30:00Z" },
          },
        },
        withdrawn: true,
        preparing: false,
        workingRevision: null,
        section: null,
        unsavedContent: false,
        missingFields: [],
        pending: false,
        markReady: vi.fn(),
        publishRevision: vi.fn(),
        setConfirmation,
      }}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );

  expect(screen.getByRole("heading", { name: "Applicant submission" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Manage submission" })).not.toBeInTheDocument();
  expect(screen.queryByText("Withdrawn", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Withdrawn" })).toBeVisible();
  expect(screen.queryByText("Ready for review")).not.toBeInTheDocument();
  expect(screen.getByText(/3 February 2027/)).toBeVisible();
  expect(screen.getByText("Recorded by Dana Reed")).toBeVisible();
  expect(screen.getByText(reason)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Start revised submission" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark ready for review" })).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole("button", { name: "Reinstate application" }));
  expect(setConfirmation).toHaveBeenCalledWith("reinstate");
});

it("keeps a failed revision recording beside its action without repeating it in confirmations", () => {
  const { update } = renderControls(states[2]);
  update({ error: { status: "unavailable" } });

  const preparation = within(screen.getByRole("region", { name: "Application preparation" }));
  expect(preparation.getByRole("alert")).toHaveTextContent("Could not save the application");
  expect(preparation.getByRole("button", { name: "Record revision" })).toBeEnabled();

  update({ error: { status: "unavailable" }, confirmation: "discard_revision" });
  expect(preparation.queryByRole("alert")).not.toBeInTheDocument();
});
