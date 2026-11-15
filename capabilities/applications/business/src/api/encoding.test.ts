import { expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { makeApplication } from "../../tests/fixtures";
import {
  decodeIntakeApplication,
  encodeIntakeApplication,
  encodeApplicationMaterial,
  decodeApplicationMaterial,
} from "../domain/encoding";
import {
  createApplicationRequestSchema,
  editApplicationRequestSchema,
  selectContactRequestSchema,
} from "./index";

it.each([null, fromMinorUnits(9007199254740993n)])(
  "preserves intake facts and keeps staff work out of applicant material: %s",
  (requested) => {
    const application = makeApplication({
      requested,
      summary: "Staff interpretation",
      contactId: "contact",
      submission: {
        version: 1,
        organization: "Alder",
        contact: "Sam",
        contactEmail: "sam@example.test",
        answers: [
          {
            questionId: "93205cef-fbf5-5e66-849f-9596bbbf23c5",
            question: "Plan",
            response: "Community meals",
          },
        ],
      },
    });
    const before = structuredClone(application);
    const decoded = decodeIntakeApplication(
      JSON.parse(JSON.stringify(encodeIntakeApplication(application))),
    );
    expect(decoded).toMatchObject({
      requested,
      summary: application.summary,
      contactId: "contact",
      submission: application.submission,
    });
    expect(decoded).not.toHaveProperty("reviews");
    expect(decoded).not.toHaveProperty("managerRecommendation");
    const material = decodeApplicationMaterial(
      JSON.parse(JSON.stringify(encodeApplicationMaterial(application))),
    );
    expect(material.requested).toEqual(requested);
    expect(material.submission).toEqual({
      version: 1,
      organization: "Alder",
      answers: application.submission!.answers,
    });
    for (const key of ["summary", "contactId", "reviews", "managerRecommendation"]) {
      expect(material).not.toHaveProperty(key);
    }
    expect(() =>
      decodeApplicationMaterial({
        ...encodeApplicationMaterial(application),
        version: 0,
      }),
    ).toThrow();
    expect(application).toEqual(before);
    expect(() =>
      decodeIntakeApplication({
        ...encodeIntakeApplication(application),
        requested: { minorUnits: "-1", currency: "EUR" },
      }),
    ).toThrow();
  },
);

it("normalizes command material and validates revision and contact identity", () => {
  const address = { workspaceSlug: "alder", publicId: "0123456789ab" };
  const requestId = "01a1bf9d-aa6f-7b30-9015-bcabb7406cbc";
  const creation = { ...address, requestId, title: "Application" };
  expect(createApplicationRequestSchema.parse(creation).requested).toBeUndefined();
  expect(createApplicationRequestSchema.parse({ ...creation, requested: "12.3" }).requested).toBe(
    "12.30",
  );
  expect(createApplicationRequestSchema.safeParse({ ...creation, requested: "-1" }).success).toBe(
    false,
  );
  const edit = { ...address, expectedRevision: 0, change: { action: "mark_ready" } };
  expect(editApplicationRequestSchema.safeParse(edit).success).toBe(true);
  expect(editApplicationRequestSchema.safeParse({ ...edit, expectedRevision: -1 }).success).toBe(
    false,
  );
  expect(
    selectContactRequestSchema.parse({ ...address, expectedRevision: 0, contactId: null })
      .contactId,
  ).toBeNull();
  expect(
    selectContactRequestSchema.safeParse({ ...address, expectedRevision: 0, contactId: "" })
      .success,
  ).toBe(false);
});
