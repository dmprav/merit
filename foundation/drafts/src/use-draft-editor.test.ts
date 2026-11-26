import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { useDraftEditor } from "./index";

type Draft = { text: string };

const initial: Draft = { text: "" };

const setup = (
  overrides: Partial<Parameters<typeof useDraftEditor<Draft, string, never>>[0]> = {},
) => {
  const onDraftChange = vi.fn();
  const onClose = vi.fn();
  const onSave = vi.fn<(value: string) => null>(() => null);
  const view = renderHook(
    (props: { draft?: Draft }) =>
      useDraftEditor<Draft, string, never>({
        initialDraft: initial,
        draft: props.draft,
        onDraftChange,
        onClose,
        onSave,
        ...overrides,
      }),
    { initialProps: {} as { draft?: Draft } },
  );
  return { view, onDraftChange, onClose, onSave };
};

it("seeds the draft once opened, and offers to resume it while closed", () => {
  const { view, onDraftChange } = setup();
  expect(onDraftChange).not.toHaveBeenCalled();

  act(() => view.result.current.open());
  expect(view.result.current.isOpen).toBe(true);
  expect(onDraftChange).toHaveBeenCalledWith(initial);

  view.rerender({ draft: { text: "started" } });
  expect(view.result.current.canResume).toBe(false);
});

it("waits for the store before seeding", () => {
  const { view, onDraftChange } = setup({ ready: false });
  act(() => view.result.current.open());
  expect(onDraftChange).not.toHaveBeenCalled();
});

it("drops an untouched draft on close, keeps an edited one, and drops it on discard", async () => {
  const untouched = setup();
  untouched.view.rerender({ draft: initial });
  await act(() => untouched.view.result.current.close());
  expect(untouched.onClose).toHaveBeenCalled();
  expect(untouched.onDraftChange).toHaveBeenCalledWith(undefined);

  const edited = setup();
  edited.view.rerender({ draft: { text: "started" } });
  await act(() => edited.view.result.current.close());
  expect(edited.onDraftChange).not.toHaveBeenCalled();
  expect(edited.view.result.current.canResume).toBe(true);

  await act(() => edited.view.result.current.close(true));
  expect(edited.onDraftChange).toHaveBeenCalledWith(undefined);
});

it("reports a save that throws as unavailable and a refusal as is", async () => {
  const { view, onSave } = setup();
  onSave.mockImplementationOnce(() => {
    throw new Error("offline");
  });
  let failure: unknown;
  await act(async () => {
    failure = await view.result.current.save("one");
  });
  expect(failure).toEqual({ status: "unavailable" });
  expect(view.result.current.isSaving).toBe(false);

  await act(async () => {
    failure = await view.result.current.save("two");
  });
  expect(failure).toBeNull();
});
