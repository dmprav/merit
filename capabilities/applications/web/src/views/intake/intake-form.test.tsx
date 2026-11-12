import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

import { applicationView } from "@merit/grantmaking/api";
import { makeApplication } from "@merit/grantmaking/testing/fixtures";
import { createQueryClient } from "@merit/query";

import type { IntakeData } from "../../contracts/intake";
import type { IntakeSection } from "../../controllers/intake/intake-state";
import { useApplicationIntake } from "../../controllers/intake/use-application-intake";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { GrantmakingDrafts } from "../../testing/providers";
import { IntakeForm } from "./intake-form";

vi.mock("@merit/contacts-web/contacts", () => ({ ContactPicker: () => null }));

const application = applicationView(
  makeApplication({
    intakeStatus: "ready",
    summary: "Original staff summary",
    submission: { version: 1, contact: "Sam", answers: [] },
  }),
);
const working = {
  kind: "revision" as const,
  content: {
    title: "Original title",
    applicant: "Original applicant",
    requested: "24000.00",
    projectPeriod: "Spring",
    answers: [
      {
        questionId: "01bdd6c5-dab0-534c-927f-19fcc61540bc",
        question: "Project plan",
        response: "Original response",
      },
    ],
  },
  reason: "Original explanation",
};
const latest = {
  ...working,
  content: {
    title: "Saved title",
    applicant: "Saved applicant",
    requested: "28000.00",
    projectPeriod: "Summer",
    answers: [
      {
        questionId: "95cdb46c-6d9e-5667-a5a8-8a4c87707bab",
        question: "Updated project plan",
        response: "Saved response",
      },
    ],
  },
  reason: "Saved explanation",
};

const Session = ({
  section,
  data,
  current = application,
}: {
  section: IntakeSection;
  data: IntakeData;
  current?: typeof application;
}) => {
  const intake = useApplicationIntake({ application: current, data, onDeleted: async () => {} });
  return (
    <>
      <button onClick={() => intake.open(section)}>Edit</button>
      <IntakeForm editor={intake.editor} onClose={intake.close} />
    </>
  );
};

const renderForm = (section: IntakeSection) => {
  const data: IntakeData = {
    draftKey: "conflicting-intake",
    workspaceSlug: "alder",
    publicId: "b8q3w5j7c2df",
    state: { revision: 1, workingRevision: working, history: [] },
    save: vi.fn<IntakeData["save"]>().mockResolvedValue({ status: "ok", revision: 3 }),
    refresh: async () => {},
    refreshCurrent: async () => {},
  };
  const client = createQueryClient();
  const view = render(<Session section={section} data={data} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <GrantmakingMessagesProvider>
          <GrantmakingDrafts>{children}</GrantmakingDrafts>
        </GrantmakingMessagesProvider>
      </QueryClientProvider>
    ),
  });
  return { ...view, data, user: userEvent.setup() };
};

const sections = [
  {
    section: "title",
    field: "Project title",
    saved: ["Saved title", "Saved explanation"],
  },
  {
    section: "metadata",
    field: "Applicant",
    saved: [
      "Applicant: Saved applicant",
      "Requested amount: 28000.00",
      "Applicant contact: Leah",
      "Project dates: Summer",
      "Saved explanation",
    ],
  },
  {
    section: "content",
    field: "Applicant’s response",
    saved: ["Updated project plan", "Saved response", "Saved explanation"],
  },
  { section: "details", field: "Staff summary", saved: ["Saved summary"] },
] as const;

const conflictedForm = async (section: (typeof sections)[number]["section"]) => {
  const rendered = renderForm(section);
  const { user, data, rerender } = rendered;
  const field = sections.find((item) => item.section === section)!.field;
  await user.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByRole("textbox", { name: field }), {
    target: { value: "My unfinished changes" },
  });
  if (section !== "details") {
    fireEvent.change(screen.getByRole("textbox", { name: "What changed and why" }), {
      target: { value: "My explanation" },
    });
  }
  rerender(
    <Session
      section={section}
      data={{ ...data, state: { ...data.state, revision: 2, workingRevision: latest } }}
      current={{
        ...application,
        summary: "Saved summary",
        submission: { version: 1, contact: "Leah", answers: [] },
      }}
    />,
  );
  return { ...rendered, field };
};

it.each(sections)(
  "shows the saved $section values and keeps save disabled until the conflict is resolved",
  async ({ section, field, saved }) => {
    const { user, data } = await conflictedForm(section);

    expect(screen.getByRole("textbox", { name: field })).toHaveValue("My unfinished changes");
    const save = screen.getByRole("button", {
      name: section === "details" ? "Save" : "Save working revision",
    });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(data.save).not.toHaveBeenCalled();

    const disclosure = screen.getByText("Latest saved values", { exact: true });
    await user.click(disclosure);
    const preview = within(disclosure.parentElement!);
    for (const value of saved) {
      expect(preview.getByText(value, { exact: true })).toBeVisible();
    }
    if (section === "details") {
      expect(preview.queryByText("Saved explanation")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: "What changed and why" }),
      ).not.toBeInTheDocument();
    }
  },
);

it.each(["Keep my changes", "Use saved values"] as const)(
  "applies %s to conflicting application details and submits that result",
  async (choice) => {
    const { user, data, field } = await conflictedForm("metadata");
    await user.click(screen.getByRole("button", { name: choice }));

    const expected = choice === "Keep my changes" ? "My unfinished changes" : "Saved applicant";
    expect(screen.getByRole("textbox", { name: field })).toHaveValue(expected);
    expect(screen.getByRole("textbox", { name: "Requested amount" })).toHaveValue("28000.00");
    expect(screen.getByRole("textbox", { name: "What changed and why" })).toHaveValue(
      choice === "Keep my changes" ? "My explanation" : "Saved explanation",
    );
    expect(screen.queryByText("Latest saved values")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save working revision" }));

    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
    expect(data.save).toHaveBeenCalledTimes(1);
    expect(vi.mocked(data.save).mock.calls[0]).toMatchObject([
      {
        action: "save_revision",
        draft: { content: { applicant: expected, requested: "28000.00" } },
      },
      2,
    ]);
  },
);
