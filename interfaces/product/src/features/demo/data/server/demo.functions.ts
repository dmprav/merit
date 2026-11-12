import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

export const readDemo = createServerFn({ method: "GET" }).handler(({ context }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  return context.demo.read();
});

export const startDemo = createServerFn({ method: "POST" })
  .validator(z.object({ fresh: z.boolean(), resetWorkspaceId: z.string().optional() }))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { state, cookie } = await context.demo.start(data);
    if (cookie) {
      setCookie("merit-demo-session", cookie.token, {
        httpOnly: true,
        secure: new URL(getRequest().url).protocol === "https:",
        sameSite: "lax",
        path: "/",
        expires: cookie.expiresAt,
      });
    }

    return state;
  });
