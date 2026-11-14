import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { assert, expect, it, vi } from "vite-plus/test";

import type { ApplicationView, ApplicationRoundContext } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { encodeMoney, fromMinorUnits } from "@merit/money";

import type { RecommendationDraft } from "../../contracts/recommendations";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { RecommendationEditor } from "./recommendation-editor";

const application: ApplicationView = {
  id: "community-meals",
  title: "Community meals",
  version: makeApplication().version,
  requested: fromMinorUnits(2400000n),
  intakeStatus: "ready",
  managerRecommendation: {
    position: "Fund",
    allocation: fromMinorUnits(2400000n),
    reasoning: "Support weekly meals for the neighbourhood.",
  },
  summary: "",
  evidence: [],
  reviews: makeApplication().reviews,
  assessments: [],
  contactId: null,
  attention: [],
};
const round: ApplicationRoundContext = {
  id: "k7m2p9x4n6rt",
  title: "Community grants",
  foundation: "Alder Foundation",
  manager: "Dana Reed",
  budget: fromMinorUnits(6000000n),
  // €24,000 for this application and €28,000 allocated to other applications.
  totals: {
    proposed: fromMinorUnits(5200000n),
    remaining: fromMinorUnits(800000n),
    withdrawnApplications: 0,
  },
  criteria: [],
  criteriaVersion: makeRound().criteriaVersion,
  criteriaHistory: makeRound().criteriaHistory,
};

const EditableRecommendation = ({
  onSave,
  draft: initialDraft,
  ...props
}: Pick<ComponentProps<typeof RecommendationEditor>, "onSave"> &
  Partial<
    Pick<
      ComponentProps<typeof RecommendationEditor>,
      "application" | "round" | "draft" | "disabled" | "showActionLabel" | "children"
    >
  >) => {
  const [draft, setDraft] = useState<RecommendationDraft | undefined>(initialDraft);

  return (
    <RecommendationEditor
      application={application}
      round={round}
      disabled={false}
      {...props}
      draft={draft}
      onDraftChange={setDraft}
      onSave={onSave}
    />
  );
};

it.each([
  {
    saved: true,
    preparing: false,
    retained: false,
    label: "Edit recommendation",
    name: "Edit recommendation for",
  },
  {
    saved: false,
    preparing: false,
    retained: false,
    label: "Add recommendation",
    name: "Add recommendation for",
  },
  {
    saved: false,
    preparing: true,
    retained: false,
    label: "Defer application",
    name: "Defer application:",
  },
  {
    saved: true,
    preparing: true,
    retained: false,
    label: "Edit recommendation",
    name: "Edit recommendation for",
  },
  {
    saved: true,
    preparing: false,
    retained: true,
    label: "Resume editing",
    name: "Resume editing recommendation for",
  },
  {
    saved: false,
    preparing: false,
    retained: true,
    label: "Resume editing",
    name: "Resume editing recommendation for",
  },
  {
    saved: false,
    preparing: true,
    retained: true,
    label: "Resume editing",
    name: "Resume editing recommendation for",
  },
])(
  "presents $label (saved: $saved, preparing: $preparing, retained: $retained)",
  async ({ saved, preparing, retained, label, name }) => {
    const user = userEvent.setup();
    render(
      <EditableRecommendation
        application={{
          ...application,
          managerRecommendation: saved ? application.managerRecommendation : null,
          intakeStatus: preparing ? "in_preparation" : "ready",
        }}
        draft={
          retained ? { position: "Defer", amount: "", reasoning: "Keep this draft." } : undefined
        }
        showActionLabel
        disabled
        onSave={vi.fn()}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );
    const action = screen.getByRole("button", { name: `${name} Community meals` });

    expect(action).toHaveTextContent(label);
    expect(action).toBeDisabled();
    if (retained) {
      expect(action).toHaveAttribute("data-draft", "true");
    } else {
      expect(action).not.toHaveAttribute("data-draft");
    }
    await user.click(action);
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  },
);

it.each(["default", "slots"])(
  "retains a closed draft and restores focus after close and discard in the %s composition",
  async (composition) => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditableRecommendation onSave={onSave}>
        {composition === "slots"
          ? ({ editor, action, closeAction }) =>
              editor ? (
                <>
                  {closeAction}
                  {editor}
                </>
              ) : (
                action
              )
          : undefined}
      </EditableRecommendation>,
      { wrapper: GrantmakingMessagesProvider },
    );
    await user.click(screen.getByRole("button", { name: /Edit recommendation for/ }));
    const reasoning = screen.getByRole("textbox", { name: "Reasoning" });
    await user.clear(reasoning);
    await user.type(reasoning, "Retain this unfinished recommendation.");
    await user.click(
      screen.getByRole("button", {
        name: composition === "slots" ? "Close recommendation" : "Close",
      }),
    );

    const resume = screen.getByRole("button", { name: /Resume editing recommendation for/ });
    expect(resume).toHaveAttribute("data-draft", "true");
    expect(resume).toHaveFocus();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();

    await user.click(resume);
    expect(screen.getByRole("textbox", { name: "Reasoning" })).toHaveValue(
      "Retain this unfinished recommendation.",
    );
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    const edit = screen.getByRole("button", { name: /Edit recommendation for/ });
    expect(edit).toHaveFocus();
    expect(edit).not.toHaveAttribute("data-draft");
    await user.click(edit);
    expect(screen.getByRole("textbox", { name: "Reasoning" })).toHaveValue(
      application.managerRecommendation!.reasoning,
    );
    expect(onSave).not.toHaveBeenCalled();
  },
);

it("closes an untouched new recommendation without leaving a resumable draft", async () => {
  const user = userEvent.setup();
  render(
    <EditableRecommendation
      application={{ ...application, managerRecommendation: null }}
      onSave={vi.fn()}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: /Add recommendation for/ }));
  await user.click(screen.getByRole("button", { name: "Close" }));

  const add = screen.getByRole("button", { name: /Add recommendation for/ });
  expect(add).toHaveFocus();
  expect(add).not.toHaveAttribute("data-draft");
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

it("keeps the editor disabled while saving and restores edit-button focus after success", async () => {
  const user = userEvent.setup();
  let finishSave!: (value: null) => void;
  const onSave = vi.fn(
    () =>
      new Promise<null>((resolve) => {
        finishSave = resolve;
      }),
  );
  render(
    <GrantmakingMessagesProvider>
      <EditableRecommendation onSave={onSave} />
    </GrantmakingMessagesProvider>,
  );
  await user.click(screen.getByRole("button", { name: /Edit recommendation for/ }));
  await user.click(screen.getByRole("button", { name: "Save recommendation" }));

  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Recommendation/ })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Proposed allocation" })).toBeDisabled();
  expect(screen.getByLabelText(/Reasoning/)).toBeDisabled();

  const { position, allocation, reasoning } = application.managerRecommendation!;

  expect(onSave).toHaveBeenCalledExactlyOnceWith({ position, allocation, reasoning });

  await act(async () => finishSave(null));

  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Edit recommendation for/ })).toHaveFocus(),
  );
});

it("presents a typed validation failure, retains the edited recommendation, and retries it", async () => {
  const user = userEvent.setup();
  const onSave = vi
    .fn<ComponentProps<typeof RecommendationEditor>["onSave"]>()
    .mockResolvedValueOnce({ status: "invalid", error: "application_not_ready" })
    .mockResolvedValueOnce(null);
  render(<EditableRecommendation onSave={onSave} />, { wrapper: GrantmakingMessagesProvider });
  await user.click(screen.getByRole("button", { name: /Edit recommendation for/ }));
  const reasoning = screen.getByLabelText(/Reasoning/);
  await user.clear(reasoning);
  await user.type(reasoning, "Preserve this reasoning through a failed save.");
  await user.click(screen.getByRole("button", { name: "Save recommendation" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Mark the application ready before recommending funding. You can record a deferral while information is missing.",
  );
  expect(reasoning).toHaveValue("Preserve this reasoning through a failed save.");
  expect(reasoning).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Save recommendation" }));

  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  expect(onSave.mock.calls[1]).toEqual(onSave.mock.calls[0]);
});

it("previews replacement allocations, deferrals and invalid amounts without saving", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(
    (
      _recommendation: Parameters<
        NonNullable<ComponentProps<typeof RecommendationEditor>["onSave"]>
      >[0],
    ) => null,
  );
  render(<EditableRecommendation onSave={onSave} />, { wrapper: GrantmakingMessagesProvider });
  await user.click(screen.getByRole("button", { name: /Edit recommendation for/ }));
  const amount = screen.getByRole("textbox", { name: "Proposed allocation" });
  const preview = screen.getByRole("status", { name: "Budget preview" });

  expect(
    screen.queryByText("Saving records a recommendation, not a funding commitment."),
  ).not.toBeInTheDocument();
  expect(amount).toHaveAccessibleDescription("Euros");
  expect(amount).toBeRequired();
  expect(preview).toHaveTextContent("Remaining with draft €8,000");

  await user.clear(amount);
  await user.type(amount, "20000");

  expect(preview).toHaveTextContent("Remaining with draft €12,000");

  await user.click(screen.getByRole("button", { name: /Recommendation$/ }));
  await user.click(screen.getByRole("option", { name: "Fund with a condition" }));

  expect(amount).toHaveAccessibleDescription("Euros Counts in full toward proposed funding.");
  expect(amount).toBeRequired();

  await user.clear(amount);
  await user.type(amount, "40000");

  expect(preview).toHaveTextContent("Over budget with draft €8,000");

  await user.clear(amount);

  expect(preview).toHaveTextContent("Remaining with draft —");

  await user.click(screen.getByRole("button", { name: /Recommendation$/ }));
  await user.click(screen.getByRole("option", { name: "Defer" }));

  expect(screen.queryByRole("textbox", { name: "Proposed allocation" })).not.toBeInTheDocument();
  expect(preview).toHaveTextContent("Remaining with draft €32,000");

  await user.click(screen.getByRole("button", { name: "Close" }));

  expect(onSave).not.toHaveBeenCalled();
});

it("keeps a recommendation editable and focuses its missing reasoning without saving", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(null);
  render(<EditableRecommendation onSave={onSave} />, { wrapper: GrantmakingMessagesProvider });
  await user.click(screen.getByRole("button", { name: /Edit recommendation for/ }));
  const reasoning = screen.getByRole("textbox", { name: "Reasoning" });
  await user.clear(reasoning);
  await user.click(screen.getByRole("button", { name: "Save recommendation" }));

  expect(reasoning).toHaveFocus();
  expect(reasoning).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "Save recommendation" })).toBeEnabled();
  expect(onSave).not.toHaveBeenCalled();
});

it("requires an allocation for funding but saves a deferral after an empty allocation error", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(null);
  render(<EditableRecommendation onSave={onSave} />, { wrapper: GrantmakingMessagesProvider });
  await user.click(screen.getByRole("button", { name: /Edit recommendation for/ }));
  const amount = screen.getByRole("textbox", { name: "Proposed allocation" });
  const reasoning = screen.getByRole("textbox", { name: "Reasoning" });

  expect(screen.getByRole("button", { name: /Recommendation$/ })).toHaveAccessibleDescription(
    "Required",
  );
  expect(screen.getAllByText("Required")).toHaveLength(3);

  await user.clear(amount);
  await user.click(screen.getByRole("button", { name: "Save recommendation" }));

  expect(amount).toHaveFocus();
  expect(amount).toHaveAttribute("aria-invalid", "true");
  expect(amount).toHaveAccessibleDescription(/Enter an amount/);
  expect(reasoning).toHaveValue(application.managerRecommendation!.reasoning);
  expect(onSave).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: /Recommendation$/ }));
  await user.click(screen.getByRole("option", { name: "Defer" }));

  expect(screen.queryByRole("textbox", { name: "Proposed allocation" })).not.toBeInTheDocument();
  expect(reasoning).toBeRequired();
  expect(screen.getAllByText("Required")).toHaveLength(2);

  await user.click(screen.getByRole("button", { name: "Save recommendation" }));

  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  expect(onSave).toHaveBeenCalledExactlyOnceWith({
    position: "Defer",
    allocation: fromMinorUnits(0n),
    reasoning: application.managerRecommendation!.reasoning,
  });
});

it("formats allocations on blur and saves the same cents shown in the budget preview", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(
    (
      _recommendation: Parameters<
        NonNullable<ComponentProps<typeof RecommendationEditor>["onSave"]>
      >[0],
    ) => null,
  );
  render(<EditableRecommendation onSave={onSave} />, { wrapper: GrantmakingMessagesProvider });
  await user.click(screen.getByRole("button", { name: /Edit recommendation for/ }));
  const amount = screen.getByRole("textbox", { name: "Proposed allocation" });
  await user.clear(amount);
  await user.type(amount, "20000.005");

  expect(screen.getByRole("status", { name: "Budget preview" })).toHaveTextContent(
    "Remaining with draft €12,000",
  );
  expect(amount).toHaveValue("20000.00");

  await user.tripleClick(amount);
  await user.paste("1.005");

  expect(amount).toHaveValue("20000.00");
  expect(screen.getByText(/The amount was not changed/)).toBeVisible();

  await user.tab();

  expect(amount).toHaveValue("20000.00");

  await user.click(screen.getByRole("button", { name: "Save recommendation" }));

  expect(
    encodeMoney(
      (onSave.mock.calls[0] ?? assert.fail("Expected onSave.mock.calls[0]"))[0].allocation,
    ).minorUnits,
  ).toBe("2000000");
});

it("keeps a withdrawn application's recommendation readable but not editable", () => {
  const withdrawn = {
    ...application,
    withdrawal: {
      withdrawnOn: "2027-01-10",
      reason: "The applicant withdrew.",
      recorder: { userId: "dana", name: "Dana Reed", recordedAt: "2027-01-11T09:00:00Z" },
    },
  };
  render(
    <EditableRecommendation
      application={withdrawn}
      draft={{ position: "Fund", amount: "24000", reasoning: "Unsaved" }}
      onSave={vi.fn()}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );

  expect(screen.getByRole("button", { name: /Resume editing recommendation for/ })).toBeDisabled();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

it.each([
  [0, null],
  [1, "1 withdrawn application not counted."],
  [2, "2 withdrawn applications not counted."],
])(
  "discloses %s withdrawn applications beside the budget that leaves them out",
  async (count, text) => {
    const user = userEvent.setup();
    render(
      <EditableRecommendation
        round={{ ...round, totals: { ...round.totals, withdrawnApplications: count } }}
        onSave={vi.fn()}
      />,
      { wrapper: GrantmakingMessagesProvider },
    );
    await user.click(screen.getByRole("button", { name: /Edit recommendation for/ }));

    expect(screen.getByText("Available before this recommendation")).toBeVisible();
    if (text) {
      expect(screen.getByText(text)).toBeVisible();
    } else {
      expect(screen.queryByText(/withdrawn application/)).not.toBeInTheDocument();
    }
  },
);

it("waits inside the recommendation panel, then mounts recovered writing without initializing defaults", async () => {
  const user = userEvent.setup();
  const onDraftChange = vi.fn();
  const onSave = vi.fn();

  const renderEditor = (ready: boolean, draft?: RecommendationDraft) => (
    <GrantmakingMessagesProvider>
      <RecommendationEditor
        application={application}
        round={round}
        disabled={false}
        ready={ready}
        draft={draft}
        onDraftChange={onDraftChange}
        onSave={onSave}
      />
    </GrantmakingMessagesProvider>
  );

  const view = render(renderEditor(false));
  expect(screen.getByText(application.managerRecommendation!.reasoning)).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Edit recommendation for/ }));
  expect(screen.getByText("Preparing editor…")).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(onDraftChange).not.toHaveBeenCalled();
  view.rerender(
    renderEditor(true, { position: "Fund", amount: "12,", reasoning: "Recovered judgment" }),
  );
  expect(screen.getByRole("textbox", { name: "Reasoning" })).toHaveValue("Recovered judgment");
  expect(onDraftChange).not.toHaveBeenCalled();
});

it("closing recommendation recovery cancels opening even when the close callback is still pending", async () => {
  const user = userEvent.setup();
  const onDraftChange = vi.fn();
  const onClose = vi.fn(() => new Promise<void>(() => {}));

  const renderEditor = (ready: boolean) => (
    <GrantmakingMessagesProvider>
      <RecommendationEditor
        application={application}
        round={round}
        disabled={false}
        ready={ready}
        onDraftChange={onDraftChange}
        onSave={vi.fn()}
        onClose={onClose}
      />
    </GrantmakingMessagesProvider>
  );

  const view = render(renderEditor(false));
  await user.click(screen.getByRole("button", { name: /Edit recommendation for/ }));
  expect(screen.getByRole("button", { name: "Close recommendation" })).toHaveFocus();
  await user.keyboard("{Escape}");
  view.rerender(renderEditor(true));
  expect(screen.queryByText("Preparing editor…")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(onDraftChange).not.toHaveBeenCalled();
});
