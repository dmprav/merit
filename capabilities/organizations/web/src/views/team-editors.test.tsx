import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { teamFixture } from "../../tests/team.fixtures";
import { en } from "../messages";
import { EditForm, InviteForm } from "./team-editors";

it("uses the common email translation before sending a team invitation", async () => {
  const save = vi.fn().mockResolvedValue(null);
  render(
    <MessagesProvider
      messages={{ team: en, common: { validation: { email: "Translated invitation email" } } }}
    >
      <InviteForm
        draft={{
          email: "invalid",
          requestId: crypto.randomUUID(),
          administration: "none",
          role: "program_manager",
        }}
        canAppoint={false}
        onChange={vi.fn()}
        onSave={save}
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
      />
    </MessagesProvider>,
  );
  expect(screen.getByRole("button", { name: /Grant-work access/ })).toBeVisible();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: en.invite }));
  const email = screen.getByRole("textbox", { name: en.email });

  expect(email).toHaveAccessibleDescription("Translated invitation email");
  expect(save).not.toHaveBeenCalled();

  await user.clear(email);
  await user.type(email, "sam@example.test");
  await user.click(screen.getByRole("button", { name: /Grant-work access/ }));
  await user.click(screen.getByRole("option", { name: /^Reviewer/ }));
  await user.click(screen.getByRole("button", { name: en.invite }));

  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ role: "reviewer", email: "sam@example.test" }),
  );
});

it.each(["reviewer", "program_manager"] as const)(
  "explains assignment loss before saving %s as a member and clears it when retaining eligibility",
  async (role) => {
    const save = vi.fn().mockResolvedValue(null);
    render(
      <MessagesProvider messages={{ team: en }}>
        <EditForm
          member={{ ...teamFixture.members[1]!, role }}
          team={teamFixture}
          onSave={save}
          onCancel={vi.fn()}
          onDiscard={vi.fn()}
          onChange={vi.fn()}
          conflict={false}
        />
      </MessagesProvider>,
    );
    const user = userEvent.setup();
    expect(screen.queryByText(en.savingEndsReviewAssignments)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Grant-work access/ }));
    await user.click(screen.getByRole("option", { name: /^No grant-work access/ }));
    expect(screen.getByText(en.savingEndsReviewAssignments)).toBeVisible();
    expect(save).not.toHaveBeenCalled();

    for (const label of [/^Reviewer/, /^Program manager/]) {
      await user.click(screen.getByRole("button", { name: /Grant-work access/ }));
      await user.click(screen.getByRole("option", { name: label }));
      expect(screen.queryByText(en.savingEndsReviewAssignments)).not.toBeInTheDocument();
    }
  },
);
