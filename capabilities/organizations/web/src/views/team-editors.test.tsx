import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { en } from "../messages";
import { InviteForm } from "./team-editors";

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
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: en.invite }));
  const email = screen.getByRole("textbox", { name: en.email });

  expect(email).toHaveAccessibleDescription("Translated invitation email");
  expect(save).not.toHaveBeenCalled();

  await user.clear(email);
  await user.type(email, "sam@example.test");
  await user.click(screen.getByRole("button", { name: en.invite }));

  expect(save).toHaveBeenCalledOnce();
});
