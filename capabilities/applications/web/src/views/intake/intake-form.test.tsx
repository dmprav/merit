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

vi.mock("@merit/contacts-web/contacts", () => ({
  ContactPicker: () => null,
  ContactLabel: ({ fallback }: { fallback: ReactNode }) => fallback,
}));

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
      <button>Read application reference</button>
      <IntakeForm editor={intake.editor} onClose={intake.close} />
    </>
  );
};

const renderForm = (section: IntakeSection, initialWorking = working) => {
  const data: IntakeData = {
    draftKey: "conflicting-intake",
    workspaceSlug: "alder",
    publicId: "b8q3w5j7c2df",
    state: { revision: 1, workingRevision: initialWorking, history: [] },
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
    saved: ["Saved applicant", "€28,000", "Leah", "Summer", "Saved explanation"],
  },
  {
    section: "content",
    field: "Applicant’s response",
    saved: ["Updated project plan", "Saved response", "Saved explanation"],
  },
  { section: "details", field: "Staff summary", saved: ["Saved summary"] },
] as const;

const conflictedForm = async (
  section: (typeof sections)[number]["section"],
  readingReference = false,
) => {
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
  if (readingReference) {
    await user.click(screen.getByRole("button", { name: "Read application reference" }));
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
  "compares saved and unsaved $section values before editing resumes",
  async ({ section, field, saved }) => {
    const { data } = await conflictedForm(section);

    expect(screen.queryByRole("textbox", { name: field })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: section === "details" ? "Save" : "Save working revision",
      }),
    ).not.toBeInTheDocument();
    const draft = within(screen.getByRole("region", { name: "Your unsaved changes" }));
    expect(draft.getByText("My unfinished changes")).toBeVisible();
    expect(screen.getAllByRole("heading", { name: "Review conflicting changes" })).toHaveLength(1);
    expect(data.save).not.toHaveBeenCalled();

    const preview = within(screen.getByRole("region", { name: "Latest saved values" }));
    expect(preview.getByRole("heading", { name: "Latest saved values" })).toBeVisible();
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

it("limits entered money precision while retaining invalid recovered amounts for validation", async () => {
  const { user, data, rerender } = renderForm("metadata");
  await user.click(screen.getByRole("button", { name: "Edit" }));
  const amount = screen.getByRole("textbox", { name: "Requested amount" });
  await user.clear(amount);
  await user.type(amount, "24,001");
  expect(amount).toHaveValue("24.00");

  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  rerender(
    <Session
      section="metadata"
      data={{
        ...data,
        state: {
          ...data.state,
          workingRevision: { ...working, content: { ...working.content, requested: "24.001" } },
        },
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByRole("textbox", { name: "Requested amount" })).toHaveValue("24.001");
  await user.click(screen.getByRole("button", { name: "Save working revision" }));
  expect(
    screen.getByText("Enter a nonnegative amount with at most two decimal places."),
  ).toBeVisible();
  expect(data.save).not.toHaveBeenCalled();
});

it("keeps invalid recovered amounts exact in the conflict comparison", async () => {
  const { user, data, rerender } = renderForm("metadata", {
    ...working,
    content: { ...working.content, requested: "24.001" },
  });
  await user.click(screen.getByRole("button", { name: "Edit" }));
  rerender(
    <Session
      section="metadata"
      data={{ ...data, state: { ...data.state, revision: 2, workingRevision: latest } }}
    />,
  );
  const draft = within(screen.getByRole("region", { name: "Your unsaved changes" }));
  expect(draft.getByText("24.001")).toBeVisible();
  expect(draft.queryByText("€24")).not.toBeInTheDocument();
  expect(data.save).not.toHaveBeenCalled();
});

it("moves focus from a replaced editor to its reconciliation heading", async () => {
  await conflictedForm("metadata");
  expect(screen.getByRole("heading", { name: "Review conflicting changes" })).toHaveFocus();
});

it("keeps reference focus when an editor becomes conflicted in the background", async () => {
  await conflictedForm("metadata", true);
  expect(screen.getByRole("region", { name: "Review conflicting changes" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Read application reference" })).toHaveFocus();
});

it("closes an unresolved conflict with Escape and retains the draft for reopening", async () => {
  const { user, data } = await conflictedForm("metadata");
  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("region", { name: "Review conflicting changes" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit" }));
  const draft = within(screen.getByRole("region", { name: "Your unsaved changes" }));
  expect(draft.getByText("My unfinished changes")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Review conflicting changes" })).toHaveFocus();
  expect(data.save).not.toHaveBeenCalled();
});
