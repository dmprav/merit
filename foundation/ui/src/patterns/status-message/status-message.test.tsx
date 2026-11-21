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

it("keeps an empty live region mounted and announces without showing the message", () => {
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

it("announces an identical message again only for a new event", () => {
  const { rerender } = render(<StatusMessage message="Criterion moved" eventId={1} />);
  advance(100);
  const status = screen.getByRole("status");
  rerender(<StatusMessage message="Criterion moved" eventId={1} />);

  expect(status).toHaveTextContent("Criterion moved");

  rerender(<StatusMessage message="Criterion moved" eventId={2} />);

  expect(status).toBeEmptyDOMElement();

  advance(100);

  expect(status).toHaveTextContent("Criterion moved");
});

it("replaces pending announcements and clears when the message becomes null", () => {
  const { rerender } = render(<StatusMessage message="Loading demo" eventId={1} />);
  advance(50);
  rerender(<StatusMessage message="Demo loaded" eventId={2} />);
  advance(50);

  expect(screen.getByRole("status")).toBeEmptyDOMElement();

  advance(50);

  expect(screen.getByRole("status")).toHaveTextContent("Demo loaded");

  rerender(<StatusMessage message={null} eventId={2} />);

  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels its pending announcement when unmounted", () => {
  const { unmount } = render(<StatusMessage message="Demo loaded" eventId={1} />);
  unmount();

  expect(vi.getTimerCount()).toBe(0);
});
