import { expect, it } from "vite-plus/test";

import { addCriterionObservations, reconcileObservations } from "./observations";

it("follows reordered criteria while retaining their notes and adding new criteria", () => {
  const existing = [
    {
      criterionId: "20000000-0000-4000-8000-000000000001",
      criterion: "Benefit",
      text: "Reaches neighbours.",
    },
    {
      criterionId: "20000000-0000-4000-8000-000000000002",
      criterion: "Delivery",
      text: "Experienced team.",
    },
  ];
  expect(
    reconcileObservations(existing, [
      { id: "20000000-0000-4000-8000-000000000002", title: "Delivery" },
      { id: "20000000-0000-4000-8000-000000000003", title: "Budget" },
      { id: "20000000-0000-4000-8000-000000000001", title: "Benefit" },
    ]),
  ).toEqual([
    {
      criterionId: "20000000-0000-4000-8000-000000000002",
      criterion: "Delivery",
      text: "Experienced team.",
    },
    { criterionId: "20000000-0000-4000-8000-000000000003", criterion: "Budget", text: "" },
    {
      criterionId: "20000000-0000-4000-8000-000000000001",
      criterion: "Benefit",
      text: "Reaches neighbours.",
    },
  ]);
  expect(existing[0]?.criterion).toBe("Benefit");
});

it("retains written notes outside the new basis and removes unused empty fields", () => {
  expect(
    reconcileObservations(
      [
        { criterionId: null, criterion: "Old benefit", text: "Keep this qualification." },
        { criterionId: null, criterion: "Old budget", text: "  " },
      ],
      [{ id: "20000000-0000-4000-8000-000000000002", title: "Delivery" }],
    ),
  ).toEqual([
    { criterionId: "20000000-0000-4000-8000-000000000002", criterion: "Delivery", text: "" },
    { criterionId: null, criterion: "Old benefit", text: "Keep this qualification." },
  ]);
});

it("preserves written observations when the criteria basis is unknown", () => {
  expect(
    reconcileObservations(
      [
        {
          criterionId: "20000000-0000-4000-8000-000000000001",
          criterion: "Benefit",
          text: "Keep this note.",
        },
        { criterionId: "20000000-0000-4000-8000-000000000002", criterion: "Delivery", text: "" },
      ],
      [],
    ),
  ).toEqual([
    {
      criterionId: "20000000-0000-4000-8000-000000000001",
      criterion: "Benefit",
      text: "Keep this note.",
    },
  ]);
});

it("opens missing note fields without rearranging or duplicating existing notes", () => {
  const existing = [
    { criterionId: null, criterion: "Other", text: "A retained note." },
    { criterionId: "20000000-0000-4000-8000-000000000002", criterion: "Delivery", text: "" },
  ];
  const criteria = [
    { id: "20000000-0000-4000-8000-000000000001", title: "Benefit" },
    { id: "20000000-0000-4000-8000-000000000002", title: "Delivery" },
  ];
  const opened = addCriterionObservations(existing, criteria);
  expect(opened).toEqual([
    ...existing,
    { criterionId: "20000000-0000-4000-8000-000000000001", criterion: "Benefit", text: "" },
  ]);
  expect(addCriterionObservations(opened, criteria)).toEqual(opened);
  expect(addCriterionObservations(existing, [])).toEqual(existing);
});

it("keeps separate notes for identical titles and preserves received labels through renames", () => {
  const a = { id: "20000000-0000-4000-8000-000000000001", title: "Fit" };
  const b = { id: "20000000-0000-4000-8000-000000000002", title: "Fit" };
  const notes = [
    { criterionId: a.id, criterion: "Fit", text: "First" },
    { criterionId: b.id, criterion: "Fit", text: "Second" },
  ];
  expect(reconcileObservations(notes, [b, { ...a, title: "Purpose" }])).toEqual([
    notes[1],
    notes[0],
  ]);
  expect(reconcileObservations(notes, [b])).toEqual([notes[1], notes[0]]);
  expect(addCriterionObservations(notes, [a, b])).toEqual(notes);
  expect(
    reconcileObservations([{ criterionId: null, criterion: "Fit", text: "Unidentified" }], [a]),
  ).toEqual([
    { criterionId: a.id, criterion: "Fit", text: "" },
    { criterionId: null, criterion: "Fit", text: "Unidentified" },
  ]);
});
