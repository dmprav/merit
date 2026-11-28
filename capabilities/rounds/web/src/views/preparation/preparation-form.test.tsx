import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import {
  preparationDraft,
  type PreparationDraft,
} from "../../controllers/preparation/preparation-state";
import { makePreparationRound } from "../../testing/fixtures";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { PreparationForm } from "./preparation-form";

const savedRound = makePreparationRound({
  budget: fromMinorUnits(6000000n),
  criteria: [
    { id: "20000000-0000-4000-8000-000000000001", title: "Fit" },
    { id: "20000000-0000-4000-8000-000000000002", title: "Reach" },
  ],
});
const unsetRound = { ...savedRound, budget: null };

const BudgetExample = ({
  round,
  initial = preparationDraft("budget", round, 0),
  onSave,
  isPending,
}: {
  round: typeof savedRound;
  initial?: PreparationDraft;
  onSave: (draft: PreparationDraft) => Promise<string | null>;
  isPending?: boolean;
}) => {
  const [draft, setDraft] = useState(initial);
  return (
    <GrantmakingMessagesProvider>
      <PreparationForm
        draft={draft}
        round={round}
        onChange={setDraft}
        onSave={onSave}
        onCancel={vi.fn()}
        isPending={isPending}
        budgetPreviouslySet={round.budget !== null}
      />
    </GrantmakingMessagesProvider>
  );
};

const renderBudget = (props: Parameters<typeof BudgetExample>[0]) => {
  render(<BudgetExample {...props} />);
  return {
    user: userEvent.setup(),
    amount: screen.getByRole("textbox", { name: "Round budget" }),
    save: () => screen.getByRole("button", { name: "Update budget" }),
  };
};

it("rejects a third decimal typed or pasted into the round budget and shows the precision status", async () => {
  const onSave = vi.fn().mockResolvedValue(null);
  const { user, amount } = renderBudget({ round: unsetRound, onSave });

  await user.type(amount, "12.345");
  expect(amount).toHaveValue("12.34");
  expect(amount).toHaveAccessibleDescription(/Amount unchanged\. Use up to two decimal places\./);

  await user.clear(amount);
  await user.paste("99.999");
  expect(amount).toHaveValue("");
  expect(amount).toHaveAccessibleDescription(/Amount unchanged\. Use up to two decimal places\./);

  await user.paste("1,250.50");
  expect(amount).toHaveValue("1250.50");
});

it("normalizes an unfinished round budget on blur", async () => {
  const { user, amount } = renderBudget({ round: unsetRound, onSave: vi.fn() });

  await user.type(amount, "12.");
  await user.tab();

  expect(amount).toHaveValue("12.00");
});

it("keeps the euro prefix hidden while the budget is empty and saves a valid amount", async () => {
  const onSave = vi.fn().mockResolvedValue(null);
  const { user, amount, save } = renderBudget({ round: unsetRound, onSave });

  expect(amount).toHaveAttribute("placeholder", "Not set");
  expect(screen.getByText("€", { exact: true })).not.toBeVisible();
  await user.type(amount, "1250.50");
  expect(screen.getByText("€", { exact: true })).toBeVisible();
  await user.click(save());

  expect(onSave).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ value: { amount: "1250.50", reason: "" } }),
  );
});

it("submits an emptied round budget as unset rather than zero", async () => {
  const onSave = vi.fn().mockResolvedValue(null);
  const { user, amount, save } = renderBudget({ round: savedRound, onSave });

  await user.clear(amount);
  await user.type(screen.getByRole("textbox", { name: /Reason for change/ }), "Funding withdrawn");
  await user.click(save());

  expect(onSave).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ value: { amount: "", reason: "Funding withdrawn" } }),
  );
});

it("keeps a restored invalid budget exact through blur and blocks saving until corrected", async () => {
  const onSave = vi.fn().mockResolvedValue(null);
  const initial = {
    ...preparationDraft("budget", unsetRound, 0),
    value: { amount: "123.456", reason: "" },
  } as PreparationDraft;
  const { user, amount, save } = renderBudget({ round: unsetRound, initial, onSave });

  await user.click(amount);
  await user.tab();
  expect(amount).toHaveValue("123.456");

  await user.click(save());
  expect(amount).toHaveAttribute("aria-invalid", "true");
  expect(onSave).not.toHaveBeenCalled();

  await user.clear(amount);
  await user.type(amount, "123.45");
  await user.click(save());
  expect(onSave).toHaveBeenCalledOnce();
});

it("keeps the budget read-only while the parent is pending", () => {
  renderBudget({ round: unsetRound, onSave: vi.fn(), isPending: true });

  expect(screen.getByRole("textbox", { name: "Round budget" })).toHaveAttribute("readonly");
});

it("keeps the budget read-only while its own submission is pending", async () => {
  const onSave = vi.fn(() => new Promise<string | null>(() => undefined));
  const { user, amount, save } = renderBudget({ round: unsetRound, onSave });

  await user.type(amount, "1");
  await user.click(save());

  await waitFor(() => expect(amount).toHaveAttribute("readonly"));
});

const renderSection = (
  initial: PreparationDraft,
  onSave: (draft: PreparationDraft) => Promise<string | null>,
) => {
  render(<BudgetExample round={savedRound} initial={initial} onSave={onSave} />);
  return { user: userEvent.setup() };
};

it("reorders criteria and moves focus to the moved title field", async () => {
  const { user } = renderSection(
    preparationDraft("criteria", savedRound, 0),
    vi.fn().mockResolvedValue(null),
  );
  const before = screen
    .getAllByRole("textbox", { name: "Title" })
    .map((input) => (input as HTMLInputElement).value);

  await user.click(screen.getByRole("button", { name: "Move up criterion 2" }));

  const titles = screen.getAllByRole("textbox", { name: "Title" });
  expect(titles[0]).toHaveValue(before[1]);
  expect(titles[0]).toHaveFocus();
});

it("removes a criterion and moves focus to the remaining first title", async () => {
  const { user } = renderSection(
    preparationDraft("criteria", savedRound, 0),
    vi.fn().mockResolvedValue(null),
  );
  const count = screen.getAllByRole("group").length;

  await user.click(screen.getByRole("button", { name: "Remove criterion 1" }));

  expect(screen.getAllByRole("group")).toHaveLength(count - 1);
  expect(screen.getAllByRole("textbox", { name: "Title" })[0]).toHaveFocus();
});

it("reports a save failure and preserves the edited purpose", async () => {
  const { user } = renderSection(
    preparationDraft("purpose", savedRound, 0),
    vi.fn().mockResolvedValue("We couldn’t save this round. Your draft is still here. Try again."),
  );
  const purpose = screen.getByRole("textbox", { name: "Purpose" });
  await user.clear(purpose);
  await user.type(purpose, "Build community connections.");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "We couldn’t save this round. Your draft is still here. Try again.",
  );
  expect(purpose).toHaveValue("Build community connections.");
});
