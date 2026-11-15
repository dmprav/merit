import type * as StartServer from "@tanstack/react-start/server";
import { vi } from "vite-plus/test";

// Component tests have no Start request; supply its cookie boundary from the test document.
vi.mock("@tanstack/react-start/server", async (importOriginal) => ({
  ...(await importOriginal<typeof StartServer>()),
  getCookie: (name: string) =>
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`))
      ?.split("=")[1],
}));
