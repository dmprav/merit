import { QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { NavigationPin } from "@merit/grantmaking/api";
import { createQueryClient, privateKey } from "@merit/query";

import { renderWithRouter } from "../../../../tests/render-with-router";
import { grantWorkQueryKey } from "../../../shared/grant-work-query-key";
import { PinButton } from "../pin-button";
import { NavigationPinsProvider } from "./provider";
import { changeNavigationPin, readNavigationPins } from "./server/navigation.functions";

vi.mock("./server/navigation.functions", () => ({
  readNavigationPins: vi.fn(),
  changeNavigationPin: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

const pin: NavigationPin = {
  target: { kind: "round", id: "000000000001" },
  title: "Community grants",
  context: null,
  workspaceSlug: "alder",
};
const key = [...grantWorkQueryKey("alder"), "navigation-pins"];

it("keeps a late read from undoing a confirmed pin and updates other navigation scopes", async () => {
  const client = createQueryClient();
  const reviewKey = [...privateKey, "reviewer", "navigation-pins"];
  client.setQueryData(reviewKey, { status: "ok", pins: [] });
  vi.mocked(readNavigationPins).mockResolvedValueOnce({ status: "ok", pins: [] });
  const result = { status: "ok" as const, pins: [pin] };
  vi.mocked(changeNavigationPin).mockResolvedValue(result);
  const { user } = await renderWithRouter(
    <QueryClientProvider client={client}>
      <NavigationPinsProvider>
        <PinButton target={pin.target} title={pin.title} />
      </NavigationPinsProvider>
    </QueryClientProvider>,
    "/app/alder/rounds",
  );
  const button = await screen.findByRole("button", { name: "Pin Community grants" });
  await waitFor(() => expect(button).toBeEnabled());
  let finishRead!: (value: Awaited<ReturnType<typeof readNavigationPins>>) => void;
  vi.mocked(readNavigationPins).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  act(() => {
    void client.refetchQueries({ queryKey: key });
  });
  await waitFor(() => expect(readNavigationPins).toHaveBeenCalledTimes(2));
  await user.click(button);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Unpin Community grants" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  await act(async () => {
    finishRead({ status: "ok", pins: [] });
  });
  expect(client.getQueryData(key)).toEqual(result);
  expect(client.getQueryData(reviewKey)).toEqual(result);
  client.clear();
});

it("refreshes inaccessible pins after a rejected change", async () => {
  const client = createQueryClient();
  vi.mocked(readNavigationPins)
    .mockResolvedValueOnce({ status: "ok", pins: [pin] })
    .mockResolvedValue({ status: "ok", pins: [] });
  vi.mocked(changeNavigationPin).mockResolvedValue({ status: "not_found" });
  const { user } = await renderWithRouter(
    <QueryClientProvider client={client}>
      <NavigationPinsProvider>
        <PinButton target={pin.target} title={pin.title} />
      </NavigationPinsProvider>
    </QueryClientProvider>,
    "/app/alder/rounds",
  );
  await user.click(await screen.findByRole("button", { name: "Unpin Community grants" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Pins could not be saved");
  await waitFor(() => expect(client.getQueryData(key)).toEqual({ status: "ok", pins: [] }));
  client.clear();
});
