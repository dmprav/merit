import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { grantmakingMessages } from "../../messages";
import { CreationForm } from "./creation-form";

it.each([
  ["", "Translated round name required"],
  ["A".repeat(201), "Translated character limit 200"],
])("translates creation validation for a recovered title %#", async (title, message) => {
  const onSave = vi.fn().mockResolvedValue(null);
  render(
    <MessagesProvider
      messages={{
        ...grantmakingMessages,
        common: { validation: { maxLength: "Translated character limit {{count}}" } },
        fundingRounds: {
          ...grantmakingMessages.fundingRounds,
          preparation: {
            ...grantmakingMessages.fundingRounds.preparation,
            titleRequired: "Translated round name required",
          },
        },
      }}
    >
      <CreationForm
        target={{ kind: "round", workspaceSlug: "alder", workspaceName: "Alder" }}
        draft={{
          requestId: crypto.randomUUID(),
          title: title!,
          body: "",
          amount: "",
          meetingDate: "",
          applicant: "",
        }}
        onChange={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
      />
    </MessagesProvider>,
  );
  const user = userEvent.setup();
  const name = screen.getByRole("textbox", {
    name: grantmakingMessages.fundingRounds.preparation.name,
  });
  await user.click(
    screen.getByRole("button", { name: grantmakingMessages.fundingRounds.preparation.create }),
  );

  expect(name).toHaveAccessibleDescription(message!);
  expect(onSave).not.toHaveBeenCalled();

  await user.clear(name);
  await user.type(name, "Community grants");
  await user.click(
    screen.getByRole("button", { name: grantmakingMessages.fundingRounds.preparation.create }),
  );

  expect(onSave).toHaveBeenCalledOnce();
});

it.each([
  ["0001-01-01", `${new Date().getFullYear() - 10}-01-01`],
  ["9999-12-31", `${new Date().getFullYear() + 10}-12-31`],
])(
  "rejects the out-of-range committee date %s and accepts the boundary %s",
  async (date, boundary) => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(
      <MessagesProvider messages={grantmakingMessages}>
        <CreationForm
          target={{ kind: "round", workspaceSlug: "alder", workspaceName: "Alder" }}
          draft={{
            requestId: crypto.randomUUID(),
            title: "Community grants",
            body: "",
            amount: "",
            meetingDate: date!,
            applicant: "",
          }}
          onChange={vi.fn()}
          onDiscard={vi.fn()}
          onClose={vi.fn()}
          onSave={onSave}
        />
      </MessagesProvider>,
    );
    const user = userEvent.setup();
    const input = screen.getByRole("textbox", { name: "Committee date" });
    const save = screen.getByRole("button", {
      name: grantmakingMessages.fundingRounds.preparation.create,
    });
    await user.click(save);

    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveValue(date);
    expect(input).toHaveAccessibleDescription(
      grantmakingMessages.fundingRounds.preparation.dateInvalid,
    );
    await waitFor(() => expect(input).toHaveFocus());

    await user.clear(input);
    await user.type(input, boundary!);
    await user.click(save);

    expect(onSave).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ meetingDate: boundary }),
    );
  },
);
