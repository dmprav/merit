import { setCookie } from "@tanstack/react-start/server";
import { expect, it, vi } from "vite-plus/test";

import { startDemo } from "./demo.functions";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() {
      return this;
    },
    handler: (handler: unknown) => handler,
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://upstream.internal/"),
  setCookie: vi.fn(),
}));

it.each([[true], [false]])(
  "applies the public transport's secure cookie setting (%s)",
  async (secure) => {
    const expiresAt = new Date("2027-01-01");
    const demo = {
      start: async () => ({ state: { status: "empty" }, cookie: { token: "guest", expiresAt } }),
    };
    const invoke = startDemo as unknown as (options: {
      data: { fresh: boolean };
      context: { demo: typeof demo; secureCookies: boolean };
    }) => Promise<unknown>;
    await invoke({ data: { fresh: true }, context: { demo, secureCookies: secure } });
    expect(setCookie).toHaveBeenLastCalledWith("merit-demo-session", "guest", {
      secure,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  },
);
