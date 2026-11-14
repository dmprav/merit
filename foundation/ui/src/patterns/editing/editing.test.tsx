import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { ChoiceList } from "./choice-list";
import { DateChoice } from "./date-choice";
import { InlineName } from "./inline-name";

it("renames with Enter using the save boundary captured when editing began", async () => {
  const before = vi.fn(async () => null);
  const after = vi.fn(async () => null);
  const props = {
    value: "Community grants",
    label: "Rename round",
    saveLabel: "Save name",
    cancelLabel: "Cancel",
    errorMessage: "Could not save",
  };
  const view = render(<InlineName {...props} onSave={before} />);
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: "Community grants" })).not.toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Community grants" }));

  expect(screen.getByRole("button", { name: "Save name" })).toHaveAttribute(
    "data-icon-only",
    "true",
  );
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("data-icon-only", "true");

  await user.clear(screen.getByRole("textbox", { name: "Rename round" }));
  await user.type(screen.getByRole("textbox"), "New name");
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

  await user.click(screen.getByRole("button", { name: "Community grants" }));
  await user.type(screen.getByRole("textbox"), " cancelled");
  await user.keyboard("{Escape}");

  expect(after).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Community grants" })).toHaveFocus();
});

it("preserves a failed rename and exposes the recovery message", async () => {
  const user = userEvent.setup();
  render(
    <InlineName
      value="Community grants"
      label="Rename round"
      saveLabel="Save name"
      cancelLabel="Cancel"
      errorMessage="Could not save"
      onSave={async () => "Someone changed this round. Close and reopen to use its latest version."}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Community grants" }));
  await user.type(screen.getByRole("textbox"), " 2027{Enter}");

  expect(await screen.findByRole("alert")).toHaveTextContent("Someone changed this round");
  expect(screen.getByRole("textbox")).toHaveValue("Community grants 2027");
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

it("validates typed dates and commits calendar choices and clearing directly", async () => {
  const choose = vi.fn();
  const cancel = vi.fn();
  const user = userEvent.setup();
  render(
    <MessagesProvider messages={{}}>
      <DateChoice
        applyLabel="Save date"
        cancelLabel="Cancel"
        onCancel={cancel}
        value="2027-01-21"
        label="Committee date"
        clearLabel="Clear date"
        invalidMessage="Enter a valid date"
        onChoose={choose}
      />
    </MessagesProvider>,
  );
  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "2027-02-31{Enter}");

  expect(choose).not.toHaveBeenCalled();
  expect(await screen.findByText("Enter a valid date")).toBeVisible();

  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "2027-02-20");
  await user.click(screen.getByRole("button", { name: "Save date" }));

  expect(choose).toHaveBeenLastCalledWith("2027-02-20");

  await user.click(screen.getByRole("button", { name: "Friday, 22 January 2027" }));

  expect(choose).toHaveBeenLastCalledWith("2027-01-22");
  expect(screen.getByRole("textbox")).toHaveValue("2027-01-22");

  await user.click(screen.getByRole("button", { name: "Clear date" }));

  expect(choose).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole("textbox")).toHaveValue("");

  choose.mockClear();
  screen.getByRole("button", { name: "Cancel" }).focus();
  await user.keyboard("{Enter}");

  expect(cancel).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
});

it.each(["0001-01-01", "9999-12-31"])(
  "keeps the out-of-range draft %s without committing it",
  async (date) => {
    const choose = vi.fn();
    const user = userEvent.setup();
    render(
      <MessagesProvider messages={{}}>
        <DateChoice
          applyLabel="Save date"
          cancelLabel="Cancel"
          onCancel={vi.fn()}
          value={null}
          label="Committee date"
          clearLabel="Clear date"
          invalidMessage="Choose a year within 10 years of the current year."
          onChoose={choose}
        />
      </MessagesProvider>,
    );
    const input = screen.getByRole("textbox");
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
    saveLabel: "Save name",
    cancelLabel: "Close",
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
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

  view.rerender(tree("Renamed by a colleague", false, recovered));
  expect(screen.getByRole("textbox")).toHaveValue("Renamed by a colleague");
  await user.click(screen.getByRole("button", { name: "Save name" }));

  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(before).not.toHaveBeenCalled();
  expect(recovered).not.toHaveBeenCalled();
});

it("keeps a pending name editor closable and captures the save boundary only when preparation finishes", async () => {
  const before = vi.fn(async () => null);
  const recovered = vi.fn(async () => null);
  const later = vi.fn(async () => null);
  const props = {
    value: "Community grants",
    label: "Rename round",
    saveLabel: "Save name",
    cancelLabel: "Close",
    errorMessage: "Could not save",
  };

  const tree = (isPreparing: boolean, onSave = before, value = props.value) => (
    <MessagesProvider messages={{}}>
      <InlineName {...props} value={value} isPreparing={isPreparing} onSave={onSave} />
    </MessagesProvider>
  );

  const view = render(tree(true));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: props.value }));
  expect(screen.getByText("Preparing editor…")).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  await user.keyboard("{Escape}");
  view.rerender(tree(false, recovered));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(before).not.toHaveBeenCalled();

  view.rerender(tree(true));
  await user.click(screen.getByRole("button", { name: props.value }));
  view.rerender(tree(false, recovered));
  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "Recovered name");
  view.rerender(tree(false, later, "Another colleague's name"));
  expect(screen.getByRole("textbox")).toHaveValue("Recovered name");
  await user.keyboard("{Enter}");
  expect(recovered).toHaveBeenCalledWith("Recovered name");
  expect(later).not.toHaveBeenCalled();
});
