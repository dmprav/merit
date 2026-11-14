import { render, screen } from "@testing-library/react";
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
    heading: "Application preparation",
    badge: "In preparation",
    action: "Mark ready for review",
    command: "markReady",
    workingRevision: null,
  },
  {
    name: "ready",
    heading: "Manage submission",
    badge: "Ready for review",
    action: "Start revised submission",
    command: "startRevision",
    workingRevision: null,
  },
  {
    name: "revision",
    heading: "Working revision",
    badge: null,
    action: "Record revision",
    command: "publishRevision",
    workingRevision: revision,
  },
  {
    name: "correction",
    heading: "Working correction",
    badge: null,
    action: "Record revision",
    command: "publishRevision",
    workingRevision: { ...revision, kind: "correction" },
  },
] as const;

const renderControls = (state: (typeof states)[number]) => {
  const intake: ComponentProps<typeof IntakeControls>["intake"] = {
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
    canStartRevision: state.name === "ready",
    pending: false,
    startRevision: vi.fn().mockResolvedValue(null),
    markReady: vi.fn().mockResolvedValue(null),
    publishRevision: vi.fn().mockResolvedValue(null),
  };
  const onReveal = vi.fn();
  const { rerender } = render(<IntakeControls intake={intake} onReveal={onReveal} />, {
    wrapper: GrantmakingMessagesProvider,
  });
  return {
    intake,
    onReveal,
    user: userEvent.setup(),
    update: (changes: Partial<typeof intake>) =>
      rerender(<IntakeControls intake={{ ...intake, ...changes }} onReveal={onReveal} />),
  };
};

const statusBadges = () =>
  screen
    .queryAllByText(/^(In preparation|Ready for review|Unsaved edits)$/)
    .map((node) => node.textContent);

it.each(states)("keeps $name status visible while its action is pending", async (state) => {
  const { intake, onReveal, user, update } = renderControls(state);
  expect(screen.getByRole("heading", { name: state.heading })).toBeVisible();
  expect(statusBadges()).toEqual(state.badge ? [state.badge] : []);
  const action = screen.getByRole("button", { name: state.action });
  expect(action).toBeEnabled();
  await user.click(action);
  expect(intake[state.command]).toHaveBeenCalledOnce();
  expect(onReveal).toHaveBeenCalledTimes(state.name === "ready" ? 1 : 0);

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
    expect(statusBadges()).toEqual(["Unsaved edits"]);
    const action = screen.getByRole("button", { name: state.action });
    expect(action).toBeDisabled();
    expect(screen.getByText(/Save or discard your unsaved application edits/)).toBeVisible();
    await user.click(action);
    expect(intake[state.command]).not.toHaveBeenCalled();

    update({ unsavedContent: true, section: "content" });
    expect(screen.queryByRole("button", { name: state.action })).not.toBeInTheDocument();
    expect(statusBadges()).toEqual(["Unsaved edits"]);

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
        canStartRevision: false,
        pending: false,
        startRevision: vi.fn(),
        markReady: vi.fn(),
        publishRevision: vi.fn(),
        setConfirmation,
      }}
      onReveal={vi.fn()}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );

  expect(screen.getByRole("heading", { name: "Withdrawn application" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Manage submission" })).not.toBeInTheDocument();
  expect(screen.getByText("Withdrawn")).toBeVisible();
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
