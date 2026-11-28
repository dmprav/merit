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

const renderAmount = (kind: "round" | "application", amount = "") => {
  const onSave = vi.fn().mockResolvedValue(null);
  render(
    <MessagesProvider messages={grantmakingMessages}>
      <CreationForm
        target={
          kind === "round"
            ? { kind: "round", workspaceSlug: "alder", workspaceName: "Alder" }
            : {
                kind: "application",
                workspaceSlug: "alder",
                roundPublicId: "k7m2p9x4n6rt",
                roundTitle: "Spring grants",
              }
        }
        draft={{
          requestId: crypto.randomUUID(),
          title: "Community grants",
          body: "",
          amount,
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
  return {
    onSave,
    user: userEvent.setup(),
    amount: screen.getByRole("textbox", {
      name: kind === "round" ? "Budget" : "Requested amount",
    }),
    save: () =>
      screen.getByRole("button", {
        name:
          kind === "round"
            ? grantmakingMessages.fundingRounds.preparation.create
            : grantmakingMessages.fundingRounds.intake.add,
      }),
  };
};

it.each(["round", "application"] as const)(
  "rejects a third decimal typed or pasted into the %s creation amount",
  async (kind) => {
    const { user, amount } = renderAmount(kind);

    await user.type(amount, "12.345");
    expect(amount).toHaveValue("12.34");
    expect(screen.getByRole("status")).toHaveTextContent(
      grantmakingMessages.fundingRounds.validation.amountPrecision,
    );

    await user.clear(amount);
    await user.paste("99.999");
    expect(amount).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent(
      grantmakingMessages.fundingRounds.validation.amountPrecision,
    );
  },
);

it.each(["round", "application"] as const)(
  "normalizes an unfinished %s creation amount on blur and keeps an empty amount unset",
  async (kind) => {
    const { user, amount, save, onSave } = renderAmount(kind);

    await user.type(amount, "12.");
    await user.tab();
    expect(amount).toHaveValue("12.00");

    await user.clear(amount);
    await user.click(save());

    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ amount: "" }));
  },
);

it("keeps a restored invalid creation amount until it is corrected", async () => {
  const { user, amount, save, onSave } = renderAmount("round", "123.456");

  await user.click(amount);
  await user.tab();
  expect(amount).toHaveValue("123.456");

  await user.click(save());
  expect(amount).toHaveAttribute("aria-invalid", "true");
  expect(onSave).not.toHaveBeenCalled();
  await waitFor(() => expect(amount).toHaveFocus());

  await user.clear(amount);
  await user.type(amount, "123.45");
  await user.click(save());
  expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ amount: "123.45" }));
});

it("creates an application with a title and selected PDFs after uploads finish", async () => {
  const user = userEvent.setup();
  const pdf = { id: crypto.randomUUID(), filename: "budget.pdf", byteLength: 128 };

  let finish = () => {};

  const upload = new Promise<{ status: "ok"; pdf: typeof pdf }>((resolve) => {
    finish = () => resolve({ status: "ok", pdf });
  });
  const onSave = vi.fn().mockResolvedValue(null);
  render(
    <MessagesProvider messages={grantmakingMessages}>
      <CreationForm
        target={{
          kind: "application",
          workspaceSlug: "alder",
          roundPublicId: "k7m2p9x4n6rt",
          roundTitle: "Spring grants",
        }}
        draft={{
          requestId: crypto.randomUUID(),
          title: "",
          body: "",
          applicant: "",
          meetingDate: "",
          amount: "",
        }}
        pdfUpload={{ mode: "samples", stage: () => upload }}
        onChange={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
      />
    </MessagesProvider>,
  );
  const title = screen.getByRole("textbox", { name: "Project title" });
  await user.type(title, "Community project");
  await user.click(screen.getByRole("button", { name: "Choose a sample PDF" }));
  await user.click(screen.getByRole("menuitem", { name: "Sample budget" }));
  expect(screen.getByRole("button", { name: "Add application" })).toBeDisabled();
  await user.click(title);
  await user.keyboard("{Enter}");
  expect(onSave).not.toHaveBeenCalled();
  finish();
  await screen.findByText("budget.pdf");
  await user.click(screen.getByRole("button", { name: "Add application" }));
  expect(onSave).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ title: "Community project", pdfs: [pdf], body: "", applicant: "" }),
  );
});
