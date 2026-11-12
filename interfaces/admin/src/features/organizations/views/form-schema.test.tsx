import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";
import { createOrganizationInput } from "@merit/organizations/api";

import { en } from "../../../app/messages.en";
import { useOrganizationSchema } from "./form-schema";

const messages = {
  administration: {
    ...en,
    validation: {
      nameRequired: "Translated organization name",
      addressFormat: "Translated address format",
      addressReserved: "Translated reserved address",
    },
  },
  common: { validation: { email: "Translated email", maxLength: "Translated maximum {{count}}" } },
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MessagesProvider messages={messages}>{children}</MessagesProvider>
);

const input = {
  requestId: crypto.randomUUID(),
  name: "Alder",
  slug: "alder",
  email: "owner@example.test",
};

it.each([
  ["name", " ", "Translated organization name"],
  ["name", "A".repeat(161), "Translated maximum 160"],
  ["slug", "Invalid Address", "Translated address format"],
  ["slug", "sign-in", "Translated reserved address"],
  ["email", "invalid", "Translated email"],
] as const)("translates organization validation for %s: %s", async (field, value, message) => {
  const { result } = renderHook(() => useOrganizationSchema(createOrganizationInput), {
    wrapper: Wrapper,
  });

  expect(await result.current["~standard"].validate({ ...input, [field]: value })).toMatchObject({
    issues: [{ path: [field], message }],
  });
});

it("keeps organization input normalization at the same boundary", async () => {
  const { result } = renderHook(() => useOrganizationSchema(createOrganizationInput), {
    wrapper: Wrapper,
  });
  expect(
    await result.current["~standard"].validate({
      ...input,
      name: " Alder ",
      email: "Owner@example.test",
    }),
  ).toEqual({
    value: input,
  });
});
