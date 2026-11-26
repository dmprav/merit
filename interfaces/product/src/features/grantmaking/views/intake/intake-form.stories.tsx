import type { Meta, StoryObj } from "@storybook/react-vite";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { expect, fn, mocked, userEvent, within } from "storybook/test";

import {
  newIntakeDraft,
  sectionValues,
  type IntakeDraft,
  type IntakeSnapshot,
  type IntakeSection,
} from "@merit/applications-web/intake";
import { useApplicationIntake } from "@merit/applications-web/intake";
import { ApplicationDetails, IntakeForm } from "@merit/applications-web/intake";
import type { IntakeChange } from "@merit/applications/domain";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { ApplicationContainedPreview } from "@merit/grantmaking-web/testing";
import { getExampleRound } from "@merit/grantmaking/examples";
import { fromMinorUnits } from "@merit/money";
import { Button } from "@merit/ui/button";
import { Reading } from "@merit/ui/layout";
import { PageHeader } from "@merit/ui/page-header";
import { ReferencePane, ReferenceWorkspace, WorkPane } from "@merit/ui/reference-workspace";

import { StoryEnvironment } from "../../../../../tests/storybook";
import { readContacts } from "../../../contacts/data/server/contacts.functions";

const initial: IntakeSnapshot = {
  content: {
    title: "Neighbour Table",
    applicant: "Neighbourhood Kitchen",
    requested: "",
    answers: [
      {
        questionId: "01bdd6c5-dab0-534c-927f-19fcc61540bc",
        question: "Project plan",
        response: "Weekly meals with local residents.",
      },
    ],
  },
  reason: "",
  summary: "",
};
const conflictingRequested = fromMinorUnits(2800000n);

const IntakeSession = ({
  section = "metadata",
  working = false,
  conflict = false,
  onSave,
}: {
  section?: IntakeSection;
  working?: boolean;
  conflict?: boolean;
  onSave: (value: IntakeChange) => Promise<string | null>;
}) => {
  const application = {
    ...getExampleRound().applications[0]!,
    intakeStatus: working ? ("ready" as const) : ("in_preparation" as const),
    requested: conflict ? conflictingRequested : null,
    title: initial.content.title,
    summary: "",
    submission: {
      version: 1,
      organization: initial.content.applicant,
      answers: initial.content.answers,
      contact: "Leah Martin",
      contactEmail: "leah@example.test",
    },
  };
  const latest = conflict
    ? { ...initial, content: { ...initial.content, requested: "28000.00" } }
    : initial;

  const navigate = useNavigate();
  const intake = useApplicationIntake({
    application,
    data: {
      draftKey: "form-preview",
      workspaceSlug: "alder",
      publicId: "m7n2p9x4k6rt",
      state: {
        revision: conflict ? 2 : 1,
        history: [],
        workingRevision: working ? { kind: "revision", content: latest.content, reason: "" } : null,
      },
      save: async (change) =>
        (await onSave(change)) ? { status: "unavailable" } : { status: "ok", revision: 2 },
      refresh: async () => {},
      refreshCurrent: async () => {},
    },
    onDeleted: () =>
      navigate({ to: "/app/$workspaceSlug/rounds", params: { workspaceSlug: "alder" } }),
  });
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    initialized.current = true;
    intake.open(section);
    intake.editor.updateDraft({
      ...newIntakeDraft(section, initial, 1),
      value: sectionValues(
        section,
        conflict
          ? {
              ...initial,
              content: { ...initial.content, applicant: "Neighbourhood Kitchen — local edit" },
            }
          : initial,
      ),
    } as IntakeDraft);
  }, [intake, section, conflict]);

  const label =
    section === "content"
      ? "Edit applicant submission"
      : section === "details"
        ? "Edit staff summary"
        : section === "title"
          ? "Correct application title"
          : "Edit application details";

  const editor = (
    <section>
      {intake.section ? (
        <IntakeForm editor={{ ...intake.editor, latest }} onClose={intake.close} />
      ) : (
        <Button onPress={() => intake.open(section)}>Edit</Button>
      )}
    </section>
  );

  return (
    <ApplicationContainedPreview locationKey="intake-form">
      <ReferenceWorkspace header={<PageHeader title={application.title} density="compact" />}>
        {section === "content" ? (
          <>
            <ReferencePane label={label}>{editor}</ReferencePane>
            <WorkPane label="Application details">
              <ApplicationDetails application={application} />
            </WorkPane>
          </>
        ) : (
          <WorkPane as="section" label={label}>
            <Reading prose={false}>{editor}</Reading>
          </WorkPane>
        )}
      </ReferenceWorkspace>
    </ApplicationContainedPreview>
  );
};

const IntakePreview = (props: Parameters<typeof IntakeSession>[0]) => (
  <StoryEnvironment>
    <GrantmakingDrafts>
      <IntakeSession {...props} />
    </GrantmakingDrafts>
  </StoryEnvironment>
);

const meta = {
  title: "Features/Applications/Intake form",
  tags: ["!autodocs"],
  component: IntakePreview,
  args: { onSave: fn<(value: IntakeChange) => Promise<string | null>>(async () => null) },
  parameters: { layout: "fullscreen", controls: { disable: true } },
  beforeEach: () => {
    mocked(readContacts).mockReset().mockResolvedValue({
      status: "ok",
      workspaceName: "Alder Foundation",
      contacts: [],
    });
  },
} satisfies Meta<typeof IntakePreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PartialIntake: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("complementary")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Neighbourhood Kitchen")).not.toBeInTheDocument();
  },
};
export const WorkingRevision: Story = { args: { working: true, section: "content" } };
export const ApplicantSubmission: Story = { args: { section: "content" } };
export const NameCorrection: Story = { args: { section: "title", working: true } };
export const StaffSummary: Story = { args: { section: "details" } };
export const ConcurrentChanges: Story = {
  args: { conflict: true },
  play: async ({ canvas }) => {
    const form = within(canvas.getByRole("form"));
    const alert = form.getByRole("alert");
    await expect(alert).toHaveTextContent("This application changed while you were editing");
    await expect(form.getByRole("textbox", { name: "Applicant" })).toHaveValue(
      "Neighbourhood Kitchen — local edit",
    );
    await expect(form.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(form.getByText("€28,000")).toBeVisible();
    await expect(form.getByRole("button", { name: "Keep my changes" })).toBeEnabled();
    await expect(form.getByRole("button", { name: "Discard & load latest" })).toBeEnabled();
  },
};

export const Saving: Story = {
  args: {
    onSave: fn<(value: IntakeChange) => Promise<string | null>>(() => new Promise(() => {})),
  },
  play: async ({ canvasElement }) => {
    const form = within(within(canvasElement).getByRole("form"));
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await expect(form.getByRole("button", { name: "Saving…" })).toBeDisabled();
  },
};
export const SaveFailure: Story = {
  args: {
    onSave: fn<(value: IntakeChange) => Promise<string | null>>(
      async () => "Could not save the application. Your changes are preserved. Try again.",
    ),
  },
  play: async ({ canvasElement }) => {
    const form = within(within(canvasElement).getByRole("form"));
    await userEvent.type(form.getByRole("textbox", { name: /Requested amount/ }), "24000");
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await expect(await form.findByRole("alert")).toHaveTextContent("Your changes are preserved");
    await expect(form.getByRole("textbox", { name: /Requested amount/ })).toHaveValue("24000.00");
  },
};
