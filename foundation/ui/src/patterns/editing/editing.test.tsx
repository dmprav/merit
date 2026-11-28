import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { ChoiceList } from "./choice-list";
import { DateChoice } from "./date-choice";
import { InlineName } from "./inline-name";

const props = {
  value: "Community grants",
  label: "Rename round",
  errorMessage: "Could not save",
};

const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Community grants" }));
  return screen.getByRole("textbox", { name: "Rename round" });
};

it("renames with Enter using the save boundary captured when editing began", async () => {
  const before = vi.fn(async () => null);
  const after = vi.fn(async () => null);
  const view = render(<InlineName {...props} onSave={before} />);
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: "Community grants" })).not.toHaveFocus();
  const input = await openEditor(user);

  expect(screen.queryByRole("button", { name: "Save name" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

  await user.clear(input);
  await user.type(input, "New name");
  view.rerender(<InlineName {...props} onSave={after} />);
  // A frame may run before React commits the button that replaces the editor.
  const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 0;
  });
  try {
    await user.keyboard("{Enter}");
  } finally {
    frame.mockRestore();
  }

  await waitFor(() => expect(before).toHaveBeenCalledWith("New name"));
  expect(after).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Community grants" })).toHaveFocus(),
  );
});

it("reverts an untouched draft even when the name changes while the editor is open", async () => {
  const user = userEvent.setup();
  const save = vi.fn(async () => null);
  const view = render(<InlineName {...props} onSave={save} />);
  const input = await openEditor(user);

  view.rerender(<InlineName {...props} value="Community grants 2027" onSave={save} />);
  await user.type(input, "{Enter}");

  expect(save).not.toHaveBeenCalled();
});

it("saves when focus leaves the field and leaves focus where the person put it", async () => {
  const save = vi.fn(async () => null);
  render(
    <>
      <InlineName {...props} onSave={save} />
      <button>Elsewhere</button>
    </>,
  );
  const user = userEvent.setup();
  await user.type(await openEditor(user), " 2027");
  await user.click(screen.getByRole("button", { name: "Elsewhere" }));

  await waitFor(() => expect(save).toHaveBeenCalledWith("Community grants 2027"));
  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
});

it("cancels a rename with Escape without saving, even when blur follows, and returns focus", async () => {
  const save = vi.fn(async () => null);
  render(<InlineName {...props} onSave={save} />);
  const user = userEvent.setup();
  const input = await openEditor(user);
  await user.type(input, " cancelled");
  await user.keyboard("{Escape}");

  expect(save).not.toHaveBeenCalled();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Community grants" })).toHaveFocus();
});

it("does not pull focus back to the name when a delayed Enter save resolves after focus moved", async () => {
  let finish: (failure: string | null) => void = () => {};

  const save = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
  render(
    <>
      <InlineName {...props} onSave={save} />
      <button>Elsewhere</button>
    </>,
  );
  const user = userEvent.setup();
  await user.type(await openEditor(user), " 2027{Enter}");
  await user.click(screen.getByRole("button", { name: "Elsewhere" }));
  finish(null);

  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
});

it("turns pasted line breaks into spaces and keeps Enter from adding one", async () => {
  render(<InlineName {...props} onSave={async () => null} />);
  const user = userEvent.setup();
  const input = await openEditor(user);
  await user.clear(input);
  await user.paste("First\nSecond\r\nThird");

  expect(input).toHaveValue("First Second Third");
});

it.each([
  ["empty", "{Backspace>16/}"],
  ["unchanged", " {Backspace}"],
])("reverts an %s draft on blur without saving", async (_name, keys) => {
  const save = vi.fn(async () => null);
  render(
    <>
      <InlineName {...props} onSave={save} />
      <button>Elsewhere</button>
    </>,
  );
  const user = userEvent.setup();
  await user.type(await openEditor(user), keys);
  await user.click(screen.getByRole("button", { name: "Elsewhere" }));

  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Community grants" })).toBeInTheDocument();
});

it("is read-only while saving and does not save twice", async () => {
  let finish: (failure: string | null) => void = () => {};

  const save = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
  render(<InlineName {...props} onSave={save} />);
  const user = userEvent.setup();
  const input = await openEditor(user);
  await user.type(input, " 2027{Enter}");

  expect(input).toHaveAttribute("readonly");
  expect(input).not.toBeDisabled();
  expect(input).toHaveAttribute("aria-busy", "true");
  await user.keyboard("{Enter}");
  fireEvent.blur(input);
  await user.type(input, "ignored");
  expect(save).toHaveBeenCalledTimes(1);
  expect(input).toHaveValue("Community grants 2027");

  finish(null);
  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
});

it("preserves a failed rename, its focus, and exposes the recovery message", async () => {
  const user = userEvent.setup();
  const message = "Someone changed this round. Close and reopen to use its latest version.";
  render(<InlineName {...props} onSave={async () => message} />);
  const input = await openEditor(user);
  await user.type(input, " 2027{Enter}");

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Someone changed this round");
  expect(input).toHaveValue("Community grants 2027");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription(message);
  await waitFor(() => expect(input).toHaveFocus());
});

it("keeps the draft and the editor open when a blur starts a save that fails", async () => {
  render(
    <>
      <InlineName {...props} onSave={async () => "Not saved"} />
      <button>Elsewhere</button>
    </>,
  );
  const user = userEvent.setup();
  const input = await openEditor(user);
  await user.type(input, " 2027");
  await user.click(screen.getByRole("button", { name: "Elsewhere" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Not saved");
  expect(input).toHaveValue("Community grants 2027");
  expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
});

it("shows a read-only editor while it prepares and closes without saving on blur", async () => {
  const save = vi.fn(async () => null);
  render(
    <MessagesProvider messages={{}}>
      <InlineName {...props} onSave={save} isPreparing />
      <button>Elsewhere</button>
    </MessagesProvider>,
  );
  const user = userEvent.setup();
  const input = await openEditor(user);

  expect(input).toHaveAttribute("readonly");
  expect(input).toHaveAttribute("aria-busy", "true");
  await user.keyboard("{Enter}");
  expect(screen.getByRole("textbox")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Elsewhere" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});

it("searches people and commits a choice with the keyboard", async () => {
  const choose = vi.fn();
  const user = userEvent.setup();
  render(
    <ChoiceList
      label="Manager"
      searchLabel="Search people"
      emptyLabel="No people"
      selectedKey="dana"
      items={[
        { id: "dana", label: "Dana Reed" },
        { id: "leah", label: "Leah Martin", description: "leah@example.test" },
      ]}
      onChoose={choose}
    />,
  );
  await user.type(screen.getByRole("textbox"), "leah@");

  expect(screen.queryByRole("option", { name: "Dana Reed" })).not.toBeInTheDocument();

  await user.tab();
  await user.keyboard("{ArrowDown}{Enter}");

  expect(choose).toHaveBeenCalledWith("leah");
});

const renderDateChoice = (value: string | null, invalidMessage = "Enter a valid date") => {
  const choose = vi.fn();
  const cancel = vi.fn();
  render(
    <MessagesProvider messages={{}}>
      <DateChoice
        applyLabel="Save date"
        cancelLabel="Cancel"
        onCancel={cancel}
        value={value}
        label="Committee date"
        clearLabel="Clear date"
        invalidMessage={invalidMessage}
        onChoose={choose}
      />
    </MessagesProvider>,
  );
  return { choose, cancel, input: screen.getByRole("textbox", { name: "Committee date" }) };
};

it("rejects an impossible typed date without committing it", async () => {
  const user = userEvent.setup();
  const { choose, input } = renderDateChoice("2027-01-21");
  await user.clear(input);
  await user.type(input, "2027-02-31{Enter}");

  expect(await screen.findByText("Enter a valid date")).toBeVisible();
  expect(input).toHaveValue("2027-02-31");
  expect(choose).not.toHaveBeenCalled();
});

it("commits a typed date when it is saved", async () => {
  const user = userEvent.setup();
  const { choose, input } = renderDateChoice("2027-01-21");
  await user.clear(input);
  await user.type(input, "2027-02-20");

  expect(choose).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Save date" }));

  expect(choose).toHaveBeenCalledExactlyOnceWith("2027-02-20");
});

it("commits a calendar choice directly and shows it in the field", async () => {
  const user = userEvent.setup();
  const { choose, input } = renderDateChoice("2027-01-21");
  await user.click(screen.getByRole("button", { name: "Friday, 22 January 2027" }));

  expect(choose).toHaveBeenCalledExactlyOnceWith("2027-01-22");
  expect(input).toHaveValue("2027-01-22");
});

it("commits clearing directly and empties the field", async () => {
  const user = userEvent.setup();
  const { choose, input } = renderDateChoice("2027-01-21");
  await user.click(screen.getByRole("button", { name: "Clear date" }));

  expect(choose).toHaveBeenCalledExactlyOnceWith(null);
  expect(input).toHaveValue("");
});

it("cancels from the keyboard without committing the draft", async () => {
  const user = userEvent.setup();
  const { choose, cancel, input } = renderDateChoice("2027-01-21");
  await user.clear(input);
  await user.type(input, "2027-02-20");
  screen.getByRole("button", { name: "Cancel" }).focus();
  await user.keyboard("{Enter}");

  expect(cancel).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
});

it.each(["0001-01-01", "9999-12-31"])(
  "keeps the out-of-range draft %s without committing it",
  async (date) => {
    const user = userEvent.setup();
    const { choose, input } = renderDateChoice(
      null,
      "Choose a year within 10 years of the current year.",
    );
    await user.type(input, `${date}{Enter}`);

    expect(input).toHaveValue(date);
    expect(input).toHaveAccessibleDescription("Choose a year within 10 years of the current year.");
    expect(choose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save date" }));
    expect(choose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Clear date" }));
    expect(choose).toHaveBeenCalledExactlyOnceWith(null);
  },
);

it("refreshes the name when preparation finishes so saving unchanged does not overwrite a newer name", async () => {
  const before = vi.fn(async () => null);
  const recovered = vi.fn(async () => null);
  const props = {
    label: "Rename round",
    errorMessage: "Could not save",
  };

  const tree = (value: string, isPreparing: boolean, onSave = before) => (
    <MessagesProvider messages={{}}>
      <InlineName {...props} value={value} isPreparing={isPreparing} onSave={onSave} />
    </MessagesProvider>
  );

  const view = render(tree("Community grants", true));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Community grants" }));
  expect(screen.getByRole("textbox")).toHaveAttribute("readonly");

  view.rerender(tree("Renamed by a colleague", false, recovered));
  expect(screen.getByRole("textbox")).toHaveValue("Renamed by a colleague");
  expect(screen.getByRole("textbox")).not.toHaveAttribute("readonly");
  await user.keyboard("{Enter}");

  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(before).not.toHaveBeenCalled();
  expect(recovered).not.toHaveBeenCalled();
});

const preparingName = () => {
  const props = {
    value: "Community grants",
    label: "Rename round",
    errorMessage: "Could not save",
  };

  const tree = (
    isPreparing: boolean,
    onSave: (name: string) => Promise<string | null>,
    value = props.value,
  ) => (
    <MessagesProvider messages={{}}>
      <InlineName {...props} value={value} isPreparing={isPreparing} onSave={onSave} />
    </MessagesProvider>
  );

  return { name: props.value, tree };
};

it("closes a preparing name editor with Escape without reopening it once preparation finishes", async () => {
  const save = vi.fn(async () => null);
  const { name, tree } = preparingName();
  const view = render(tree(true, save));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name }));

  expect(screen.getByRole("status")).toHaveTextContent("Preparing editor…");
  expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  expect(screen.getByRole("textbox")).toHaveFocus();

  await user.keyboard("{Escape}");
  view.rerender(tree(false, save));

  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});

it("captures the save boundary when preparation finishes rather than on later updates", async () => {
  const recovered = vi.fn(async () => null);
  const later = vi.fn(async () => null);
  const { name, tree } = preparingName();
  const view = render(
    tree(
      true,
      vi.fn(async () => null),
    ),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name }));
  view.rerender(tree(false, recovered));
  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "Recovered name");
  view.rerender(tree(false, later, "Another colleague's name"));

  expect(screen.getByRole("textbox")).toHaveValue("Recovered name");

  await user.keyboard("{Enter}");

  expect(recovered).toHaveBeenCalledExactlyOnceWith("Recovered name");
  expect(later).not.toHaveBeenCalled();
});
