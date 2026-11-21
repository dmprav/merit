import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { showToast, Toasts, useEventToast, useToastWhile, type ToastMessage } from "./toast";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

const renderToasts = (children?: ReactNode) =>
  render(
    <MessagesProvider messages={{}}>
      {children}
      <Toasts />
    </MessagesProvider>,
  );

const toast = (name: string) => screen.queryByRole("alertdialog", { name });

it("dismisses a plain success after four seconds", () => {
  renderToasts();
  act(() => {
    showToast({ tone: "success", message: "Recommendation saved" });
  });

  expect(toast("Recommendation saved")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(4000);
  });

  expect(toast("Recommendation saved")).not.toBeInTheDocument();
});

it.each([
  { tone: "danger", message: "The address could not be copied." },
  { tone: "success", message: "Criterion removed", action: { label: "Undo", onPress: () => {} } },
] satisfies ToastMessage[])("keeps $message until the person dismisses it", async (message) => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderToasts();
  act(() => {
    showToast(message);
  });
  act(() => {
    vi.advanceTimersByTime(60_000);
  });

  expect(toast(message.message)).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Close" }));

  expect(toast(message.message)).not.toBeInTheDocument();
});

it("runs the action once and dismisses the toast", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const retry = vi.fn();
  renderToasts();
  act(() => {
    showToast({
      tone: "warning",
      message: "Saved, but the latest round could not be loaded.",
      action: { label: "Refresh", onPress: retry },
    });
  });

  await user.click(screen.getByRole("button", { name: "Refresh" }));

  expect(retry).toHaveBeenCalledOnce();
  expect(toast("Saved, but the latest round could not be loaded.")).not.toBeInTheDocument();
});

const SaveEvents = ({ event, undo }: { event: number; undo: boolean }) => {
  useEventToast(event, {
    tone: "success",
    message: `Saved ${event}`,
    action: undo ? { label: "Undo", onPress: () => {} } : undefined,
  });

  return null;
};

it("shows each new event once and replaces the previous event's toast", () => {
  const { rerender } = renderToasts(<SaveEvents event={0} undo />);

  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

  rerender(
    <MessagesProvider messages={{}}>
      <SaveEvents event={1} undo />
      <Toasts />
    </MessagesProvider>,
  );

  expect(toast("Saved 1")).toBeVisible();

  rerender(
    <MessagesProvider messages={{}}>
      <SaveEvents event={2} undo={false} />
      <Toasts />
    </MessagesProvider>,
  );

  expect(toast("Saved 1")).not.toBeInTheDocument();
  expect(toast("Saved 2")).toBeVisible();
  expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
});

it.each([true, false])("scopes a saved event to its owner when it offers Undo (%s)", (undo) => {
  const view = (event: number | null) => (
    <MessagesProvider messages={{}}>
      {event !== null && <SaveEvents event={event} undo={undo} />}
      <Toasts />
    </MessagesProvider>
  );

  const { rerender } = render(view(0));
  rerender(view(1));
  expect(toast("Saved 1")).toBeVisible();

  rerender(view(null));

  if (undo) {
    expect(toast("Saved 1")).not.toBeInTheDocument();
  } else {
    expect(toast("Saved 1")).toBeVisible();
  }
});

const RefreshFailure = ({ failed, onRefresh }: { failed: boolean; onRefresh: () => void }) => {
  useToastWhile(
    failed
      ? {
          tone: "warning",
          message: "The latest round could not be loaded.",
          action: { label: "Refresh", onPress: onRefresh },
        }
      : null,
  );

  return null;
};

it("keeps a toast up while its condition lasts and removes it once the condition clears", () => {
  const refresh = vi.fn();

  const view = (failed: boolean | null) => (
    <MessagesProvider messages={{}}>
      {failed !== null && <RefreshFailure failed={failed} onRefresh={refresh} />}
      <Toasts />
    </MessagesProvider>
  );

  const { rerender } = render(view(false));

  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

  rerender(view(true));
  rerender(view(true));

  expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  expect(toast("The latest round could not be loaded.")).toBeVisible();

  rerender(view(false));

  expect(toast("The latest round could not be loaded.")).not.toBeInTheDocument();

  rerender(view(true));
  rerender(view(null));

  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

it("uses the current recovery action while the failure stays active", async () => {
  const original = vi.fn();
  const current = vi.fn();

  const view = (onRefresh: () => void) => (
    <MessagesProvider messages={{}}>
      <RefreshFailure failed onRefresh={onRefresh} />
      <Toasts />
    </MessagesProvider>
  );

  const { rerender } = render(view(original));
  rerender(view(current));

  await userEvent
    .setup({ advanceTimers: vi.advanceTimersByTime })
    .click(screen.getByRole("button", { name: "Refresh" }));
  expect(current).toHaveBeenCalledOnce();
  expect(original).not.toHaveBeenCalled();
});
