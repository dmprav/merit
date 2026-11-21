import { expect, it } from "vite-plus/test";

import { linkedApplicationTitles } from "./linked-applications";

const link = (contactId: string, id: string, title: string, position: number) => ({
  contactId,
  id,
  title,
  position,
});

it("lists each related application once per contact, in round position order", () => {
  expect(
    linkedApplicationTitles([
      link("sam", "b", "Second", 2),
      link("sam", "a", "First", 1),
      link("sam", "b", "Second", 2),
      link("rae", "c", "Other", 0),
    ]),
  ).toEqual(
    new Map([
      ["sam", ["First", "Second"]],
      ["rae", ["Other"]],
    ]),
  );
});

it("orders applications at the same position in different rounds by identity", () => {
  expect(
    linkedApplicationTitles([link("sam", "y", "Later", 0), link("sam", "x", "Earlier", 0)]),
  ).toEqual(new Map([["sam", ["Earlier", "Later"]]]));
});

it("omits contacts with no related applications", () => {
  expect(linkedApplicationTitles([])).toEqual(new Map());
});
