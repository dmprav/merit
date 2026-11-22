import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

export const readDemo = createServerFn({ method: "GET" }).handler(({ context }) =>
  context.demo.read(),
);

export const startDemo = createServerFn({ method: "POST" })
  .validator(z.object({ fresh: z.boolean(), resetWorkspaceId: z.uuid().optional() }))
  .handler(async ({ context, data }) => {
    const { state, cookie } = await context.demo.start(data);
    if (cookie) {
      setCookie("merit-demo-session", cookie.token, {
        httpOnly: true,
        secure: context.secureCookies,
        sameSite: "lax",
        path: "/",
        expires: cookie.expiresAt,
      });
    }

    return state;
  });
