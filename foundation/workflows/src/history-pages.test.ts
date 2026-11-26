import { expect, it, vi } from "vite-plus/test";

import { readAllHistoryPages } from "../testing/index.ts";

it("follows every page token and combines the events, so a later page is searched too", async () => {
  const fetchPage = vi
    .fn<Parameters<typeof readAllHistoryPages>[0]>()
    .mockResolvedValueOnce({
      history: { events: [{ markerRecordedEventAttributes: { markerName: "1" } }] },
      nextPageToken: Uint8Array.of(1),
    })
    .mockResolvedValueOnce({
      history: { events: [{ markerRecordedEventAttributes: { markerName: "2" } }] },
      nextPageToken: Uint8Array.of(2),
    })
    .mockResolvedValueOnce({
      history: { events: [{ markerRecordedEventAttributes: { markerName: "3" } }] },
      nextPageToken: new Uint8Array(),
    });

  const history = await readAllHistoryPages(fetchPage);

  expect(history.events).toEqual([
    { markerRecordedEventAttributes: { markerName: "1" } },
    { markerRecordedEventAttributes: { markerName: "2" } },
    { markerRecordedEventAttributes: { markerName: "3" } },
  ]);
  expect(fetchPage.mock.calls.map(([token]) => token)).toEqual([
    undefined,
    Uint8Array.of(1),
    Uint8Array.of(2),
  ]);
});

it("returns no events for an empty history", async () => {
  expect((await readAllHistoryPages(async () => ({}))).events).toEqual([]);
});
