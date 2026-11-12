import { expect, it, vi } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";
import * as money from "@merit/money";

import { makeApplication } from "../../tests/fixtures";
import { newIntakeApplication, requestedTotalProblem, withIntakeContact } from "./index";

it("starts partial intake without inventing applicant material or judgments", () => {
  const application = newIntakeApplication("case", { title: "A new request" });
  expect(application).toEqual({
    id: "case",
    title: "A new request",
    version: 1,
    requested: null,
    intakeStatus: "in_preparation",
    summary: "",
    evidence: [],
    contactId: null,
    attention: [],
    submission: { version: 1, organization: "", answers: [] },
  });
});

it("records supplied material and distinguishes zero from a missing amount", () => {
  const answers = [
    {
      questionId: "9e8cdd06-b965-551e-938f-43d2df580864",
      question: "Purpose",
      response: "Community work",
    },
  ];
  const application = newIntakeApplication("case", {
    title: "A new request",
    applicant: "Alder",
    requested: "0",
    answers,
  });
  expect(application.requested).toEqual(fromMinorUnits(0n));
  expect(application.submission).toEqual({ version: 1, organization: "Alder", answers });
  expect(
    newIntakeApplication("case", { title: "Request", requested: "invalid" }).requested,
  ).toBeNull();
});

it("updates contact attribution without changing the source version, answers, or judgments", () => {
  const application = makeApplication();
  const before = structuredClone(application);
  const updated = withIntakeContact(application, "contact", {
    name: "Dana",
    email: "dana@example.org",
  });
  expect(updated).toEqual({
    ...application,
    contactId: "contact",
    submission: { ...application.submission, contact: "Dana", contactEmail: "dana@example.org" },
  });
  expect(application).toEqual(before);
  expect(withIntakeContact(updated, null, null).submission).toMatchObject({
    contact: "",
    contactEmail: "",
  });
});

it("can record a contact before applicant material is available, including a missing email", () => {
  const application = makeApplication({ submission: undefined });
  expect(
    withIntakeContact(application, "contact", { name: "Dana", email: null }).submission,
  ).toEqual({
    version: application.version,
    answers: [],
    contact: "Dana",
    contactEmail: "",
  });
});

it("replaces a request at the money limit without double-counting it", () => {
  const maximum = fromMinorUnits(10n ** 30n - 1n);
  const requests = [
    { publicId: "case", requested: maximum },
    { publicId: "unknown", requested: null },
  ];
  expect(requestedTotalProblem(requests, { id: "case", requested: maximum })).toBeNull();
  expect(requestedTotalProblem(requests, { id: "case", requested: null })).toBeNull();
  expect(requestedTotalProblem(requests, { id: "another", requested: fromMinorUnits(1n) })).toBe(
    "request_total_too_large",
  );
  expect(requestedTotalProblem([], { id: "case", requested: maximum })).toBeNull();
});

it("does not report an unexpected arithmetic failure as an invalid request", () => {
  const error = new Error("Arithmetic unavailable");
  const sum = vi.spyOn(money, "sum").mockImplementationOnce(() => {
    throw error;
  });
  try {
    expect(() => requestedTotalProblem([], { id: "case", requested: null })).toThrow(error);
  } finally {
    sum.mockRestore();
  }
});
