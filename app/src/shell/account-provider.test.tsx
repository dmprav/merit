import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { useDrafts } from "@merit/drafts";
import { readDraftStorage } from "@merit/drafts/testing";
import { createQueryClient, privateKey } from "@merit/query";

import { AccountProvider } from "./account-provider";

const auth = vi.hoisted(() => ({
  isLoaded: true,
  userId: "account-a" as string | null | undefined,
}));
vi.mock("@clerk/tanstack-react-start", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => auth,
}));
const reload = vi.fn();
beforeEach(() => {
  auth.isLoaded = true;
  auth.userId = "account-a";
  reload.mockReset();
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "test-key");
  vi.stubEnv("MERIT_LOCAL_WORKSPACE", "");
  vi.stubGlobal("location", { reload });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(["account-b", null])(
  "hides previous account data and discards its cache when switching to %s",
  async (next) => {
    const format = { version: 1, schema: z.object({ text: z.string() }) };
    const drafts = renderHook(() => useDrafts("account-a", "contacts", format));
    await waitFor(() => expect(drafts.result.current.ready).toBe(true));
    act(() => drafts.result.current.update(() => ({ contact: { text: "Private writing" } })));
    await waitFor(() => expect(drafts.result.current.status).toBe("saved"));
    const client = createQueryClient();
    client.setQueryData([...privateKey, "organizations"], { name: "Previous account" });

    const view = () => (
      <QueryClientProvider client={client}>
        <AccountProvider>
          <p>Private workspace</p>
        </AccountProvider>
      </QueryClientProvider>
    );

    const rendered = render(view());

    expect(screen.getByText("Private workspace")).toBeVisible();

    auth.userId = next;
    rendered.rerender(view());

    expect(screen.queryByText("Private workspace")).not.toBeInTheDocument();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(client.getQueryCache().getAll()).toEqual([]);
    expect(drafts.result.current.drafts).toEqual({});
    expect(await readDraftStorage("account-a", "contacts")).toEqual({});
  },
);

it("waits for initial authentication without reloading in a loop", async () => {
  auth.isLoaded = false;
  auth.userId = undefined;
  const client = createQueryClient();

  const view = () => (
    <QueryClientProvider client={client}>
      <AccountProvider>
        <p>Workspace</p>
      </AccountProvider>
    </QueryClientProvider>
  );

  const rendered = render(view());
  auth.isLoaded = true;
  auth.userId = "account-a";
  rendered.rerender(view());

  expect(screen.getByText("Workspace")).toBeVisible();
  expect(reload).not.toHaveBeenCalled();

  auth.userId = "account-b";
  rendered.rerender(view());

  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});
