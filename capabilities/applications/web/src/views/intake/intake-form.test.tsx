import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  fireEvent.change(screen.getByRole("textbox", { name: "What changed and why" }), {
    target: { value: "My explanation" },
  });
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
  "keeps the $section editor mounted with ConflictBanner and the saved values on conflict",
  async ({ section, field, saved }) => {
    const { user, data } = await conflictedForm(section);

    expect(screen.getByRole("textbox", { name: field })).toHaveValue("My unfinished changes");
    expect(screen.getByRole("button", { name: "Save working revision" })).toBeDisabled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This application changed while you were editing");
    expect(data.save).not.toHaveBeenCalled();

    if (section === "metadata") {
      // Details compare in place: each differing field shows its saved value beneath it.
      expect(screen.queryByRole("button", { name: "View latest" })).not.toBeInTheDocument();
      const field = screen.getByRole("textbox", { name: "Applicant" }).closest("div");
      expect(field?.parentElement).toHaveTextContent(`Now saved as ${saved[0]}`);
      expect(screen.getByText("Saved explanation")).toBeVisible();
      return;
    }
    await user.click(screen.getByRole("button", { name: "View latest" }));
    const preview = screen.getByRole("region", { name: "Latest saved values" });
    expect(alert).not.toContainElement(preview);
    for (const value of saved) {
      expect(preview).toHaveTextContent(value);
    }
  },
);

it("saves staff summary (details) directly without conflict when application revision advances", async () => {
  const rendered = renderForm("details");
  const { user, data, rerender } = rendered;
  await user.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Staff summary" }), {
    target: { value: "Updated staff summary" },
  });
  rerender(
    <Session
      section="details"
      data={{ ...data, state: { ...data.state, revision: 2, workingRevision: latest } }}
      current={{ ...application, summary: "Summary updated elsewhere" }}
    />,
  );

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(data.save).toHaveBeenCalledOnce());
  expect(vi.mocked(data.save).mock.calls[0]?.[0]).toEqual({
    action: "details",
    summary: "Updated staff summary",
  });
});

it.each(["Keep my changes", "Discard & load latest"] as const)(
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
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

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

it("keeps invalid recovered amounts exact in the mounted form when conflicted", async () => {
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
  expect(screen.getByRole("textbox", { name: "Requested amount" })).toHaveValue("24.001");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This application changed while you were editing",
  );
  expect(data.save).not.toHaveBeenCalled();
});

it("keeps focus unchanged when a conflict arrives while reading reference or editing", async () => {
  await conflictedForm("metadata", true);
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "Read application reference" })).toHaveFocus();
});

it("closes an unresolved conflict with Escape and retains the draft for reopening", async () => {
  const { user, data } = await conflictedForm("metadata");
  screen.getByRole("textbox", { name: "Applicant" }).focus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByRole("textbox", { name: "Applicant" })).toHaveValue("My unfinished changes");
  expect(screen.getByRole("alert")).toBeVisible();
  expect(data.save).not.toHaveBeenCalled();
});

it("shows RetainedDraftNotice with copy/discard when the working revision disappears", async () => {
  const { user, data, rerender } = renderForm("content");
  const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await user.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Applicant’s response" }), {
    target: { value: "Important unsaved paragraph" },
  });

  rerender(
    <Session
      section="content"
      data={{ ...data, state: { ...data.state, revision: 2, workingRevision: null } }}
    />,
  );

  expect(
    screen.getByRole("region", { name: "Working revision no longer available" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Copy draft" }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Important unsaved paragraph"));
  await user.click(screen.getByRole("button", { name: "Discard draft" }));
  expect(
    screen.queryByRole("region", { name: "Working revision no longer available" }),
  ).not.toBeInTheDocument();
});
