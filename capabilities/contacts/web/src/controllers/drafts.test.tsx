import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { ContactDraftProvider, useContactDrafts } from "./drafts";

it("shares drafts by workspace and contact while keeping creation drafts independent", () => {
  const { result } = renderHook(() => ({ first: useContactDrafts(), second: useContactDrafts() }), {
    wrapper: ({ children }) => <ContactDraftProvider>{children}</ContactDraftProvider>,
  });
  const value = { name: "Sam", email: "unfinished@", affiliation: "" };
  const creation = { id: "new-contact", baseline: null, value };
  const alder = { id: "sam", baseline: 3, value };
  const birch = { id: "sam", baseline: 7, value: { ...value, name: "Samuel" } };

  act(() => {
    result.current.first.set("alder", undefined, creation);
    result.current.first.set("alder", "sam", alder);
    result.current.first.set("birch", "sam", birch);
  });

  expect(result.current.second.get("alder")).toEqual(creation);
  expect(result.current.second.get("alder", "sam")).toEqual(alder);
  expect(result.current.second.get("birch", "sam")).toEqual(birch);
  expect(result.current.second.has("birch")).toBe(false);

  act(() => result.current.second.set("alder", "sam", undefined));

  expect(result.current.first.has("alder", "sam")).toBe(false);
  expect(result.current.first.has("alder")).toBe(true);
  expect(result.current.first.get("alder")).toEqual(creation);
  expect(result.current.first.get("birch", "sam")).toEqual(birch);
});
