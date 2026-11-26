import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { expect, it, vi } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import type { DecisionDraft } from "../../contracts/decisions";
import {
  decisionApplication,
  decisionRound,
  firstDecision,
  oneVersion,
  twoVersions,
} from "../../testing/fixtures";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { DecisionEditor } from "./decision-editor";

const budgetFigures = (preview: HTMLElement) => {
  const amounts = within(preview).getAllByRole("definition");
  return Object.fromEntries(
    within(preview)
      .getAllByRole("term")
      .map((term, index) => [term.textContent, amounts[index]?.textContent]),
  );
};

const Editable = ({
  onSave,
  draft: initialDraft,
  ...props
}: Pick<ComponentProps<typeof DecisionEditor>, "onSave"> &
  Partial<
    Pick<
      ComponentProps<typeof DecisionEditor>,
      | "application"
      | "round"
      | "versions"
      | "draft"
      | "conflict"
      | "onKeepDraft"
      | "onLoadLatest"
      | "disabled"
      | "children"
    >
  >) => {
  const [draft, setDraft] = useState<DecisionDraft | undefined>(initialDraft);
  return (
    <DecisionEditor
      application={decisionApplication}
      round={decisionRound}
      versions={[]}
      disabled={false}
      {...props}
      draft={draft}
      onDraftChange={setDraft}
      onSave={onSave}
    />
  );
};

const fill = async (user: ReturnType<typeof userEvent.setup>, fields: Record<string, string>) => {
  for (const [label, value] of Object.entries(fields)) {
    const field = screen.getByLabelText(new RegExp(label));
    await user.clear(field);
    await user.type(field, value);
  }
};

it("offers to record a decision, showing that none exists", async () => {
  render(<Editable onSave={vi.fn()} />, { wrapper: GrantmakingMessagesProvider });

  expect(screen.getByText("No decision recorded")).toBeVisible();
  expect(screen.getByRole("button", { name: "Record decision for Community meals" })).toBeEnabled();
});

it("names the change action once a decision exists and shows its summary", () => {
  render(<Editable versions={twoVersions} onSave={vi.fn()} />, {
    wrapper: GrantmakingMessagesProvider,
  });

  expect(screen.getByRole("button", { name: "Change decision for Community meals" })).toBeVisible();
  // The current decision, and again as version 2 in the history of two versions.
  expect(screen.getAllByText("Funded with conditions")).toHaveLength(2);
  expect(screen.getAllByText("€20,000 committed")).toHaveLength(2);
  expect(screen.getAllByText("Confirm the venue in writing.")).toHaveLength(2);
  expect(screen.getAllByText(/Decided by Funding committee on/).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Recorded by Dana Reed").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/MCP: assistant|assistant/).length).toBeGreaterThan(0);
});

it("keeps the action unavailable for a withdrawn application or a disabled editor", async () => {
  const user = userEvent.setup();
  const withdrawn = {
    ...decisionApplication,
    withdrawal: {
      withdrawnOn: "2027-01-10",
      reason: "Withdrawn.",
      recorder: { userId: "dana", name: "Dana Reed", recordedAt: "2027-01-11T09:00:00Z" },
    },
  };
  render(<Editable application={withdrawn} versions={oneVersion} onSave={vi.fn()} />, {
    wrapper: GrantmakingMessagesProvider,
  });

  const action = screen.getByRole("button", { name: "Change decision for Community meals" });
  expect(action).toBeDisabled();
  await user.click(action);
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.getByText("Funded")).toBeVisible();
});

it("starts the first decision from the manager recommendation and shows it for comparison", async () => {
  const user = userEvent.setup();
  render(<Editable onSave={vi.fn()} />, { wrapper: GrantmakingMessagesProvider });
  await user.click(screen.getByRole("button", { name: /Record decision for/ }));

  expect(screen.getByRole("button", { name: /Outcome/ })).toHaveTextContent("Fund with conditions");
  expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("20000.00");
  expect(screen.getByLabelText(/Conditions/)).toHaveValue("");
  const comparison = screen.getByRole("region", { name: "Manager recommendation" });
  expect(within(comparison).getByText(/Fund with a condition/)).toBeVisible();
  expect(within(comparison).getByText("Confirm the venue before funding.")).toBeVisible();
  expect(screen.getByLabelText(/Reason/)).toHaveValue("");
  expect(screen.getByLabelText(/Decided by/)).toHaveValue("");
  expect(screen.queryByLabelText(/changing this decision/)).not.toBeInTheDocument();
});

it("starts blank without a recommendation, and says a decision needs none", async () => {
  const user = userEvent.setup();
  render(
    <Editable
      application={{ ...decisionApplication, managerRecommendation: null }}
      onSave={vi.fn()}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: /Record decision for/ }));

  expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("");
  expect(screen.getByText("No recommendation saved. A decision does not need one.")).toBeVisible();
});

it("maps a deferral recommendation to a deferral decision reserving nothing", async () => {
  const user = userEvent.setup();
  render(
    <Editable
      application={{
        ...decisionApplication,
        managerRecommendation: {
          position: "Defer",
          allocation: fromMinorUnits(0n),
          reasoning: "Wait for the review.",
        },
      }}
      onSave={vi.fn()}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: /Record decision for/ }));

  expect(screen.getByRole("button", { name: /Outcome/ })).toHaveTextContent("Defer");
  expect(screen.queryByRole("textbox", { name: "Amount" })).not.toBeInTheDocument();
});

it("saves a valid first decision with the entered fields and no explanation", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn<ComponentProps<typeof DecisionEditor>["onSave"]>(async () => null);
  render(<Editable onSave={onSave} />, { wrapper: GrantmakingMessagesProvider });
  await user.click(screen.getByRole("button", { name: /Record decision for/ }));
  await fill(user, {
    Conditions: "Secure match funding.",
    Reason: "  The committee agreed.  ",
    "Decided by": "Funding committee",
  });
  await user.type(screen.getByRole("textbox", { name: /Decision date/ }), "2026-01-18");
  await user.click(screen.getByRole("button", { name: "Save decision" }));

  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.calls.at(0)?.at(0)).toEqual({
    outcome: "Fund with conditions",
    amount: fromMinorUnits(2000000n),
    conditions: "Secure match funding.",
    reason: "The committee agreed.",
    decidedBy: "Funding committee",
    decisionDate: "2026-01-18",
  });
  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
});

it("reports each missing field beside it without saving", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn<ComponentProps<typeof DecisionEditor>["onSave"]>(async () => null);
  render(
    <Editable
      application={{ ...decisionApplication, managerRecommendation: null }}
      onSave={onSave}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: /Record decision for/ }));
  await user.click(screen.getByRole("button", { name: "Save decision" }));

  const invalid = (name: RegExp | string) => screen.getByRole("textbox", { name });

  await waitFor(() => expect(invalid("Amount")).toHaveAttribute("aria-invalid", "true"));
  expect(invalid("Amount")).toHaveAccessibleDescription(/Enter an amount\./);
  expect(invalid(/Reason/)).toHaveAccessibleDescription(/Explain the decision\./);
  expect(invalid(/Decided by/)).toHaveAccessibleDescription(/Name the body that decided\./);
  expect(invalid(/Decision date/)).toHaveAccessibleDescription(/Enter the decision date\./);
  expect(onSave).not.toHaveBeenCalled();
});

it("requires conditions only for funding with conditions and hides the unused fields", async () => {
  const user = userEvent.setup();
  render(<Editable onSave={vi.fn()} />, { wrapper: GrantmakingMessagesProvider });
  await user.click(screen.getByRole("button", { name: /Record decision for/ }));
  await user.click(screen.getByRole("button", { name: "Save decision" }));

  await waitFor(() =>
    expect(screen.getByLabelText(/Conditions/)).toHaveAccessibleDescription(
      /Enter the conditions that apply to this funding\./,
    ),
  );

  await user.click(screen.getByRole("button", { name: /Outcome/ }));
  await user.click(screen.getByRole("option", { name: "Decline" }));
  expect(screen.queryByLabelText(/Conditions/)).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Amount" })).not.toBeInTheDocument();
});

it("rejects a date in the future beside the date field", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn<ComponentProps<typeof DecisionEditor>["onSave"]>(async () => null);
  render(
    <Editable
      application={{ ...decisionApplication, managerRecommendation: null }}
      onSave={onSave}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: /Record decision for/ }));
  await user.click(screen.getByRole("button", { name: /Outcome/ }));
  await user.click(screen.getByRole("option", { name: "Decline" }));
  await fill(user, { Reason: "Not eligible.", "Decided by": "Funding committee" });
  await user.type(screen.getByRole("textbox", { name: /Decision date/ }), "2999-01-01");
  await user.click(screen.getByRole("button", { name: "Save decision" }));

  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: /Decision date/ })).toHaveAccessibleDescription(
      /The decision date cannot be in the future\./,
    ),
  );
  expect(onSave).not.toHaveBeenCalled();
});

it("starts a change from the current decision and requires an explanation", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn<ComponentProps<typeof DecisionEditor>["onSave"]>(async () => null);
  render(<Editable versions={oneVersion} onSave={onSave} />, {
    wrapper: GrantmakingMessagesProvider,
  });
  await user.click(screen.getByRole("button", { name: /Change decision for/ }));

  expect(screen.getByRole("button", { name: /Outcome/ })).toHaveTextContent("Fund");
  expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("24000.00");
  expect(screen.getByLabelText(/Reason/)).toHaveValue(firstDecision.reason);
  expect(screen.getByLabelText(/Decided by/)).toHaveValue("Funding committee");

  await fill(user, { Reason: "Revised after review." });
  await user.click(screen.getByRole("button", { name: "Save decision" }));
  await waitFor(() =>
    expect(screen.getByLabelText(/changing this decision/)).toHaveAccessibleDescription(
      /Explain why the decision is changing\./,
    ),
  );
  expect(onSave).not.toHaveBeenCalled();

  await fill(user, { "changing this decision": "The review changed our view." });
  await user.click(screen.getByRole("button", { name: "Save decision" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.calls.at(0)?.at(0)).toMatchObject({
    reason: "Revised after review.",
    changeExplanation: "The review changed our view.",
  });
});

it("previews the budget effect, the excess, and a round without a budget", async () => {
  const user = userEvent.setup();
  render(<Editable versions={oneVersion} onSave={vi.fn()} />, {
    wrapper: GrantmakingMessagesProvider,
  });
  await user.click(screen.getByRole("button", { name: /Change decision for/ }));
  const preview = screen.getByRole("status", { name: "Budget preview" });
  const amount = screen.getByRole("textbox", { name: "Amount" });

  // Replacing the saved €24,000 with itself leaves the round as it is.
  expect(budgetFigures(preview)).toEqual({
    "Committed with this decision": "€52,000",
    "Available with this decision": "€8,000",
  });

  await user.clear(amount);
  await user.type(amount, "20000");
  expect(budgetFigures(preview)).toEqual({
    "Committed with this decision": "€48,000",
    "Available with this decision": "€12,000",
  });

  await user.clear(amount);
  await user.type(amount, "33000");
  expect(budgetFigures(preview)).toEqual({
    "Committed with this decision": "€61,000",
    "Over budget with this decision": "€1,000",
  });

  await user.click(screen.getByRole("button", { name: /Outcome/ }));
  await user.click(screen.getByRole("option", { name: "Decline" }));
  expect(budgetFigures(preview)).toEqual({
    "Committed with this decision": "€28,000",
    "Available with this decision": "€32,000",
  });
});

it("warns that funding needs a round budget", async () => {
  const user = userEvent.setup();
  render(
    <Editable
      round={{
        ...decisionRound,
        budget: null,
        totals: { ...decisionRound.totals, available: null, committed: fromMinorUnits(0n) },
      }}
      onSave={vi.fn()}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: /Record decision for/ }));
  await user.clear(screen.getByRole("textbox", { name: "Amount" }));
  await user.type(screen.getByRole("textbox", { name: "Amount" }), "100");

  expect(screen.getByText("This round has no budget. Set one before funding.")).toBeVisible();
});

it("says once that the round has no budget after a save is refused for it", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn<ComponentProps<typeof DecisionEditor>["onSave"]>(async () => ({
    status: "invalid",
    error: "budget_required",
    budget: null,
    committed: { minorUnits: "0", currency: "EUR" },
    excess: null,
  }));
  render(
    <Editable
      round={{
        ...decisionRound,
        budget: null,
        totals: { ...decisionRound.totals, available: null, committed: fromMinorUnits(0n) },
      }}
      onSave={onSave}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: /Record decision for/ }));
  await user.clear(screen.getByRole("textbox", { name: "Amount" }));
  await user.type(screen.getByRole("textbox", { name: "Amount" }), "100");
  expect(screen.getAllByText(/This round has no budget/)).toHaveLength(1);

  await fill(user, {
    Conditions: "Secure match funding.",
    Reason: "Strong plan.",
    "Decided by": "Committee",
  });
  await user.type(screen.getByRole("textbox", { name: /Decision date/ }), "2026-01-18");
  await user.click(screen.getByRole("button", { name: "Save decision" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/Set a budget before recording/);
  expect(screen.getAllByText(/This round has no budget/)).toHaveLength(1);
});

it("saves an unchanged decision without asking why it changed", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn<ComponentProps<typeof DecisionEditor>["onSave"]>(async () => null);
  render(<Editable versions={oneVersion} onSave={onSave} />, {
    wrapper: GrantmakingMessagesProvider,
  });
  await user.click(screen.getByRole("button", { name: /Change decision for/ }));
  await user.click(screen.getByRole("button", { name: "Save decision" }));

  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.calls.at(0)?.at(0)).not.toHaveProperty("changeExplanation");
  expect(screen.queryByText("Explain why the decision is changing.")).not.toBeInTheDocument();
});

it("explains withdrawn applications left out of the committed total", async () => {
  const user = userEvent.setup();
  render(
    <Editable
      round={{ ...decisionRound, totals: { ...decisionRound.totals, withdrawnApplications: 2 } }}
      onSave={vi.fn()}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: /Record decision for/ }));

  expect(screen.getByText("2 withdrawn applications not counted.")).toBeVisible();
});

it("presents a typed failure, retains the draft, and retries it", async () => {
  const user = userEvent.setup();
  const onSave = vi
    .fn<ComponentProps<typeof DecisionEditor>["onSave"]>()
    .mockResolvedValueOnce({
      status: "invalid",
      error: "commitment_exceeds_budget",
      budget: { minorUnits: "6000000", currency: "EUR" },
      committed: { minorUnits: "6100000", currency: "EUR" },
      excess: { minorUnits: "100000", currency: "EUR" },
    })
    .mockResolvedValueOnce(null);
  render(<Editable versions={oneVersion} onSave={onSave} />, {
    wrapper: GrantmakingMessagesProvider,
  });
  await user.click(screen.getByRole("button", { name: /Change decision for/ }));
  await fill(user, { Reason: "Keep this reason.", "changing this decision": "Because." });
  await user.click(screen.getByRole("button", { name: "Save decision" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This decision would exceed the round budget by €1,000.",
  );
  expect(screen.getByLabelText(/Reason/)).toHaveValue("Keep this reason.");
  await user.click(screen.getByRole("button", { name: "Save decision" }));
  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  expect(onSave.mock.calls[1]).toEqual(onSave.mock.calls[0]);
});

it.each([
  [{ status: "conflict" as const }, /This decision has changed/],
  [{ status: "not_found" as const }, /no longer have access/],
  [{ status: "signed_out" as const }, /Sign in again/],
  [{ status: "unavailable" as const }, /couldn’t save the decision/],
  [{ status: "invalid" as const, error: "application_withdrawn" as const }, /is withdrawn/],
  [
    { status: "invalid" as const, error: "application_not_ready" as const },
    /Mark the application ready/,
  ],
  [
    {
      status: "invalid" as const,
      error: "budget_required" as const,
      budget: null,
      committed: { minorUnits: "1", currency: "EUR" as const },
      excess: null,
    },
    /has no budget/,
  ],
])("explains the failure %o without losing the draft", async (failure, message) => {
  const user = userEvent.setup();
  render(<Editable versions={oneVersion} onSave={vi.fn(async () => failure)} />, {
    wrapper: GrantmakingMessagesProvider,
  });
  await user.click(screen.getByRole("button", { name: /Change decision for/ }));
  await fill(user, { "changing this decision": "Because." });
  await user.click(screen.getByRole("button", { name: "Save decision" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByRole("form")).toBeVisible();
});

it("offers to reaffirm or discard a draft after the decision changed, and blocks saving until then", async () => {
  const user = userEvent.setup();
  const onKeepDraft = vi.fn();
  const onLoadLatest = vi.fn();
  const onSave = vi.fn<ComponentProps<typeof DecisionEditor>["onSave"]>(async () => null);
  render(
    <Editable
      versions={twoVersions}
      draft={{
        outcome: "Fund",
        amount: "24000.00",
        conditions: "",
        reason: "My draft reason.",
        decidedBy: "Funding committee",
        decisionDate: "2026-01-18",
        changeExplanation: "Draft explanation.",
      }}
      conflict="record_changed"
      onKeepDraft={onKeepDraft}
      onLoadLatest={onLoadLatest}
      onSave={onSave}
    />,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: /Resume editing decision for/ }));

  expect(screen.getByRole("alert")).toHaveTextContent("Decision changed while you were editing");
  expect(screen.getByRole("button", { name: "Save decision" })).toBeDisabled();
  expect(screen.getByLabelText(/Reason/)).toHaveValue("My draft reason.");
  await user.click(screen.getByRole("button", { name: "View latest" }));
  expect(screen.getAllByText("Reduced to match the recommendation.").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Reaffirm my draft" }));
  await user.click(screen.getByRole("button", { name: "Discard & load latest" }));
  expect(onKeepDraft).toHaveBeenCalledOnce();
  expect(onLoadLatest).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});

it("retains a closed draft, restores focus, and discards on request", async () => {
  const user = userEvent.setup();
  render(<Editable versions={oneVersion} onSave={vi.fn()} />, {
    wrapper: GrantmakingMessagesProvider,
  });
  await user.click(screen.getByRole("button", { name: /Change decision for/ }));
  await fill(user, { Reason: "Retain this unfinished decision." });
  await user.click(screen.getByRole("button", { name: "Close" }));

  const resume = screen.getByRole("button", { name: /Resume editing decision for/ });
  expect(resume).toHaveAttribute("data-draft", "true");
  expect(resume).toHaveFocus();

  await user.click(resume);
  expect(screen.getByLabelText(/Reason/)).toHaveValue("Retain this unfinished decision.");
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  const change = screen.getByRole("button", { name: /Change decision for/ });
  expect(change).toHaveFocus();
  expect(change).not.toHaveAttribute("data-draft");
});

it("holds the form while a save is pending", async () => {
  const user = userEvent.setup();
  let finish!: (value: null) => void;
  const onSave = vi.fn(
    () =>
      new Promise<null>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Editable versions={oneVersion} onSave={onSave} />, {
    wrapper: GrantmakingMessagesProvider,
  });
  await user.click(screen.getByRole("button", { name: /Change decision for/ }));
  await fill(user, { "changing this decision": "Because." });
  await user.click(screen.getByRole("button", { name: "Save decision" }));

  expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await act(async () => finish(null));
  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
});

it("composes the summary, action, and editor through slots with a separate close action", async () => {
  const user = userEvent.setup();
  render(
    <Editable versions={oneVersion} onSave={vi.fn()}>
      {({ summary, editor, action, closeAction }) => (
        <>
          {summary}
          {action}
          {editor ? closeAction : null}
          {editor}
        </>
      )}
    </Editable>,
    { wrapper: GrantmakingMessagesProvider },
  );
  await user.click(screen.getByRole("button", { name: /Change decision for/ }));

  expect(screen.getByRole("button", { name: "Close decision" })).toBeVisible();
  expect(screen.getByRole("form")).toBeVisible();
});
