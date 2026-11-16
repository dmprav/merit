import { describe, expect, it } from "vite-plus/test";

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

const answer = {
  questionId: "93205cef-fbf5-5e66-849f-9596bbbf23c5",
  question: "Plan",
  response: "Community meals",
};

const recorded = (requested: ReturnType<typeof fromMinorUnits> | null = null) =>
  makeApplication({
    requested,
    summary: "Staff interpretation",
    contactId: "contact",
    submission: {
      version: 1,
      organization: "Alder",
      contact: "Sam",
      contactEmail: "sam@example.test",
      answers: [answer],
    },
  });

const throughJson = <Value>(value: Value): unknown => JSON.parse(JSON.stringify(value));

describe("intake encoding", () => {
  it.each([null, fromMinorUnits(9007199254740993n)])(
    "preserves intake facts and an unknown or exact requested amount: %s",
    (requested) => {
      const application = recorded(requested);
      const before = structuredClone(application);

      expect(decodeIntakeApplication(throughJson(encodeIntakeApplication(application)))).toEqual({
        id: application.id,
        title: application.title,
        version: application.version,
        requested,
        intakeStatus: application.intakeStatus,
        summary: "Staff interpretation",
        evidence: [],
        contactId: "contact",
        attention: [],
        submission: application.submission,
      });
      expect(application).toEqual(before);
    },
  );

  it("rejects a stored negative requested amount", () => {
    expect(() =>
      decodeIntakeApplication({
        ...encodeIntakeApplication(recorded()),
        requested: { minorUnits: "-1", currency: "EUR" },
      }),
    ).toThrow();
  });
});

describe("applicant material encoding", () => {
  it.each([null, fromMinorUnits(9007199254740993n)])(
    "keeps staff interpretation, contact attribution, and judgments out of applicant material: %s",
    (requested) => {
      const application = recorded(requested);

      expect(
        decodeApplicationMaterial(throughJson(encodeApplicationMaterial(application))),
      ).toEqual({
        title: application.title,
        version: application.version,
        requested,
        submission: { version: 1, organization: "Alder", answers: [answer] },
        evidence: [],
      });
    },
  );

  it("rejects stored material without a valid material version", () => {
    expect(() =>
      decodeApplicationMaterial({ ...encodeApplicationMaterial(recorded()), version: 0 }),
    ).toThrow();
  });
});

describe("intake command requests", () => {
  const address = { workspaceSlug: "alder", publicId: "0123456789ab" };
  const creation = { ...address, requestId: "01a1bf9d-aa6f-7b30-9015-bcabb7406cbc", title: "Case" };

  it("leaves an omitted requested amount unknown and normalizes a supplied one", () => {
    expect(createApplicationRequestSchema.parse(creation).requested).toBeUndefined();
    expect(createApplicationRequestSchema.parse({ ...creation, requested: "12.3" }).requested).toBe(
      "12.30",
    );
    expect(createApplicationRequestSchema.safeParse({ ...creation, requested: "-1" }).success).toBe(
      false,
    );
  });

  it.each(["0123456789a", "0123456789abc", "0123456789AB", "0123456789ai", "0123456789al"])(
    "rejects application address %s outside the public identifier format",
    (publicId) => {
      expect(createApplicationRequestSchema.safeParse({ ...creation, publicId }).success).toBe(
        false,
      );
    },
  );

  it("requires a non-negative expected revision for an intake edit", () => {
    const edit = { ...address, expectedRevision: 0, change: { action: "mark_ready" } };

    expect(editApplicationRequestSchema.safeParse(edit).success).toBe(true);
    expect(editApplicationRequestSchema.safeParse({ ...edit, expectedRevision: -1 }).success).toBe(
      false,
    );
  });

  it("accepts clearing the application contact but rejects an empty contact identity", () => {
    const selection = { ...address, expectedRevision: 0 };

    expect(
      selectContactRequestSchema.parse({ ...selection, contactId: null }).contactId,
    ).toBeNull();
    expect(selectContactRequestSchema.safeParse({ ...selection, contactId: "" }).success).toBe(
      false,
    );
  });
});
