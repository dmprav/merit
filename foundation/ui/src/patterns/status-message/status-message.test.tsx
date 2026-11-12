import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { StatusMessage } from "./status-message";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const advance = (milliseconds: number) => {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
};

const confirmation = () =>
  screen
    .queryAllByText("Recommendation saved")
    .find((node) => node.getAttribute("aria-hidden") === "true");

it("keeps an empty live region mounted and announces without a visible confirmation", () => {
  const { rerender } = render(<StatusMessage message={null} eventId={0} />);
  const status = screen.getByRole("status");

  expect(status).toBeEmptyDOMElement();
  expect(status).toHaveAttribute("aria-atomic", "true");

  rerender(<StatusMessage message="Demo loaded" eventId={1} />);

  expect(screen.getByRole("status")).toBe(status);
  expect(status).toBeEmptyDOMElement();

  advance(100);

  expect(status).toHaveTextContent("Demo loaded");
  expect(screen.getAllByText("Demo loaded")).toHaveLength(1);
});

it("shows a success confirmation for four seconds without moving focus", () => {
  render(<button>Save</button>);
  const trigger = screen.getByRole("button");
  trigger.focus();
  render(
    <StatusMessage message="Recommendation saved" eventId={1} confirmation className="placement" />,
  );

  expect(confirmation()).toHaveClass("placement");
  expect(trigger).toHaveFocus();

  advance(3999);

  expect(confirmation()).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Recommendation saved");

  advance(1);

  expect(confirmation()).toBeUndefined();
  expect(screen.getByRole("status")).toHaveTextContent("Recommendation saved");
  expect(trigger).toHaveFocus();
});

it("refreshes identical announcements and renews visibility only for a new event", () => {
  const first = "save-1";
  const { rerender } = render(
    <StatusMessage message="Recommendation saved" eventId={first} confirmation />,
  );
  advance(3000);
  const status = screen.getByRole("status");
  rerender(<StatusMessage message="Recommendation saved" eventId={first} confirmation />);

  expect(status).toHaveTextContent("Recommendation saved");

  advance(1000);

  expect(confirmation()).toBeUndefined();

  rerender(<StatusMessage message="Recommendation saved" eventId="save-2" confirmation />);

  expect(screen.getByRole("status")).toBe(status);
  expect(status).toBeEmptyDOMElement();
  expect(confirmation()).toBeInTheDocument();

  advance(100);

  expect(status).toHaveTextContent("Recommendation saved");

  advance(2900);
  rerender(<StatusMessage message="Recommendation saved" eventId="save-3" confirmation />);
  advance(1500);

  expect(confirmation()).toBeInTheDocument();

  advance(2500);

  expect(confirmation()).toBeUndefined();
});

it("replaces pending announcements and clears feedback when the message becomes null", () => {
  const { rerender } = render(<StatusMessage message="Loading demo" eventId={1} />);
  advance(50);
  rerender(<StatusMessage message="Recommendation saved" eventId={2} confirmation />);
  advance(50);

  expect(screen.getByRole("status")).toBeEmptyDOMElement();

  advance(50);

  expect(screen.getByRole("status")).toHaveTextContent("Recommendation saved");

  rerender(<StatusMessage message={null} eventId={2} confirmation />);

  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(confirmation()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels both pending timers when unmounted", () => {
  const { unmount } = render(
    <StatusMessage message="Recommendation saved" eventId={1} confirmation />,
  );
  unmount();

  expect(vi.getTimerCount()).toBe(0);
});
