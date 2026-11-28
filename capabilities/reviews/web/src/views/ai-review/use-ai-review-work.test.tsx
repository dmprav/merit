import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { aiReviewDataFixture, aiReviewFixture } from "../../testing/ai-review.fixtures";
import { useAiReviewWork } from "./use-ai-review-work";

const setup = (reviews: ReturnType<typeof aiReviewFixture>[]) =>
  renderHook(() => useAiReviewWork(aiReviewDataFixture({ reviews })));

it("selects a saved run and returns to the list, ignoring a run that is gone", () => {
  const latest = aiReviewFixture();
  const earlier = aiReviewFixture({ id: "a1000000-0000-4000-8000-000000000002" });
  const { result } = setup([latest, earlier]);

  act(() => result.current!.reading.open(earlier.id));
  expect(result.current?.reading.selected).toEqual(earlier);

  act(() => result.current!.reading.close());
  expect(result.current?.reading.selected).toBeNull();

  act(() => result.current!.reading.open("a1000000-0000-4000-8000-0000000000ff"));
  expect(result.current?.reading.selected).toBeNull();
});
