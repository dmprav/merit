import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { readDraftStorage, seedDraftStorage } from "@merit/drafts/testing";

describe("workspace UI test isolation", () => {
  const expectClean = async () => {
    expect(document.body).toBeEmptyDOMElement();
    expect(sessionStorage.length).toBe(0);
    expect(await readDraftStorage("test-setup", "example")).toEqual({});
  };

  afterAll(expectClean);

  it.each([1, 2])("starts clean and exercises browser substitutes in test %i", async () => {
    await expectClean();

    render(createElement("p", null, "Mounted content"));
    expect(screen.getByText("Mounted content")).toBeVisible();
    sessionStorage.setItem("unfinished", "Draft");
    await seedDraftStorage("test-setup", "example", { record: { value: "Draft" } });
    expect(await readDraftStorage("test-setup", "example")).toEqual({
      record: { value: "Draft" },
    });
    window.scrollTo(0, 100);
    screen.getByText("Mounted content").scrollIntoView({ block: "nearest" });
    expect(window.matchMedia("(max-width: 600px)").matches).toBe(false);
  });
});
