import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { changeNavigationPinSchema } from "@merit/grantmaking/api";

export const readNavigationPins = createServerFn({ method: "GET" }).handler(({ context }) =>
  withActor(context.currentIdentity, (actor) => context.navigation.read(actor)),
);

export const changeNavigationPin = createServerFn({ method: "POST" })
  .validator(changeNavigationPinSchema)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) => context.navigation.change(actor, data)),
  );
