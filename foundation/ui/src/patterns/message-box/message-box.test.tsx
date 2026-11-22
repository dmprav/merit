import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { MessageBox } from "./message-box";

const Example = ({
  initialValue = "",
  isBusy = false,
  initialChips = [],
  description,
  onSend = () => {},
  onStop = () => {},
}: {
  initialValue?: string;
  isBusy?: boolean;
  initialChips?: string[];
  description?: string;
  onSend?: (text: string) => void;
  onStop?: () => void;
}) => {
  const [value, setValue] = useState(initialValue);
  const [chips, setChips] = useState(initialChips);
  return (
    <>
      <MessageBox
        label="Message"
        placeholder="Ask about this application"
        description={description}
        value={value}
        onChange={setValue}
        sendLabel="Send message"
        onSend={(text) => {
          onSend(text);
          setValue("");
        }}
        isBusy={isBusy}
        stopLabel="Stop"
        onStop={onStop}
        chips={chips.map((chip) => ({
          id: chip,
          label: chip,
          removeLabel: `Remove ${chip}`,
          onRemove: () => setChips((current) => current.filter((item) => item !== chip)),
        }))}
      />
      <p>Draft: {value}</p>
    </>
  );
};

it("names the input and shows the caller's placeholder", () => {
  render(<Example />);

  expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute(
    "placeholder",
    "Ask about this application",
  );
});

it("sends the text with Enter and lets the caller clear the box", async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  render(<Example onSend={onSend} />);
  await user.type(screen.getByRole("textbox", { name: "Message" }), "Summarize the budget{Enter}");

  expect(onSend).toHaveBeenCalledExactlyOnceWith("Summarize the budget");
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
});

it("inserts a new line with Shift+Enter instead of sending", async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  render(<Example onSend={onSend} />);
  await user.type(
    screen.getByRole("textbox", { name: "Message" }),
    "First{Shift>}{Enter}{/Shift}Second",
  );

  expect(onSend).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("First\nSecond");
});

it("does not send when Enter confirms an IME composition", () => {
  const onSend = vi.fn();
  render(<Example initialValue="こんにちは" onSend={onSend} />);
  const input = screen.getByRole("textbox", { name: "Message" });

  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });

  expect(onSend).not.toHaveBeenCalled();

  fireEvent.keyDown(input, { key: "Enter" });

  expect(onSend).toHaveBeenCalledExactlyOnceWith("こんにちは");
});

it("keeps Send inactive and ignores Enter while the text is empty or only whitespace", async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  render(<Example onSend={onSend} />);
  const send = screen.getByRole("button", { name: "Send message" });

  expect(send).toBeDisabled();

  await user.type(screen.getByRole("textbox", { name: "Message" }), "  {Enter}");

  expect(send).toBeDisabled();
  expect(onSend).not.toHaveBeenCalled();

  await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello");

  expect(send).toBeEnabled();
});

it("sends with the Send button and keeps focus in the input", async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  render(<Example initialValue="Hello" onSend={onSend} />);
  await user.click(screen.getByRole("button", { name: "Send message" }));

  expect(onSend).toHaveBeenCalledExactlyOnceWith("Hello");
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
});

it("replaces Send with Stop while busy and keeps the input editable", async () => {
  const user = userEvent.setup();
  const onSend = vi.fn();
  const onStop = vi.fn();
  render(<Example isBusy initialValue="Next question" onSend={onSend} onStop={onStop} />);

  expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();

  const input = screen.getByRole("textbox", { name: "Message" });
  await user.type(input, "?{Enter}");

  expect(input).toHaveValue("Next question?");
  expect(onSend).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Stop" }));

  expect(onStop).toHaveBeenCalledOnce();
});

it("shows no chip row without chips", () => {
  render(<Example />);

  expect(screen.queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();
});

it("removes a chip and moves focus to the next chip, then to the input", async () => {
  const user = userEvent.setup();
  render(<Example initialChips={["Round 2026", "Budget.pdf", "Notes"]} />);
  await user.click(screen.getByRole("button", { name: "Remove Round 2026" }));

  expect(screen.queryByRole("button", { name: "Remove Round 2026" })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Remove Budget.pdf" })).toHaveFocus(),
  );

  await user.click(screen.getByRole("button", { name: "Remove Notes" }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Remove Budget.pdf" })).toHaveFocus(),
  );

  await user.keyboard("{Enter}");

  await waitFor(() => expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus());
});

it("shows the full text of a long chip label when the chip is focused", async () => {
  const label = "A very long attachment name that would not fit on one line.pdf";
  const user = userEvent.setup();
  render(<Example initialChips={[label]} />);
  await user.tab();

  expect(await screen.findByRole("tooltip")).toHaveTextContent(label);
});

it("connects the description to the input", () => {
  render(<Example description="Enter sends. Shift+Enter adds a line." />);

  expect(screen.getByRole("textbox", { name: "Message" })).toHaveAccessibleDescription(
    "Enter sends. Shift+Enter adds a line.",
  );
});

it("lets other keys reach the surrounding panel", async () => {
  const user = userEvent.setup();
  const onKeyDown = vi.fn();
  render(
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={onKeyDown}>
      <Example />
    </div>,
  );
  await user.click(screen.getByRole("textbox", { name: "Message" }));
  await user.keyboard("{Escape}");

  expect(onKeyDown).toHaveBeenCalledOnce();
});
