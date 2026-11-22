import { assert, expect, it } from "vite-plus/test";

import { evalCases } from "./registry.ts";
import type { ObservedCall } from "./scenario";
import { fingerprintSuite } from "./suite-fingerprint";
import { gradeSelection } from "./tool-selection";

const completed = (...names: string[]): ObservedCall[] =>
  names.map((name) => ({ name, source: "merit", outcome: { kind: "success", content: {} } }));

it("allows a contact lookup to resolve ambiguity and flags the same attempt for wording alone", () => {
  const clarify = evalCases.find(({ id }) => id === "track-unassigned");
  const compose = evalCases.find(({ id }) => id === "compose-invite");
  assert(clarify && compose);
  expect(gradeSelection(clarify, { allowDiscovery: true }, completed("list_contacts"))).toEqual([]);
  const failed: ObservedCall = {
    name: "list_contacts",
    source: "merit",
    outcome: { kind: "error" },
  };
  expect(gradeSelection(compose, {}, [failed])).toEqual(["Unexpected list_contacts"]);
});

const item = (id: string) => {
  const definition = evalCases.find((item) => item.id === id);
  assert(definition);
  return definition;
};

it("accepts a demo lookup through start_demo", () => {
  expect(gradeSelection(item("resume-demo"), {}, completed("start_demo"))).toEqual([]);
});

it("flags a missing demo lookup", () => {
  expect(gradeSelection(item("resume-demo"), {}, [])).not.toEqual([]);
});

it("requires the round lookup when the manager asks for its budget", () => {
  expect(gradeSelection(item("demo-to-round"), {}, completed("start_demo"))).toContain(
    "Missed get_funding_round",
  );
  expect(
    gradeSelection(item("demo-to-round"), {}, completed("start_demo", "get_funding_round")),
  ).toEqual([]);
});

it("rejects a budget write during a lookup", () => {
  expect(
    gradeSelection(item("demo-to-round"), {}, completed("get_funding_round", "edit_funding_round")),
  ).toContain("Unexpected edit_funding_round");
});

it("permits assignment discovery after inviting a reviewer", () => {
  expect(
    gradeSelection(
      item("arrange-review"),
      {},
      completed("request_review", "invite_reviewer", "list_application_reviewers"),
    ),
  ).toEqual([]);
});

it("fingerprints the discovery policy independently of catalog order", () => {
  const original = fingerprintSuite(evalCases, ["list_contacts", "list_work"]);
  expect(fingerprintSuite(evalCases, ["list_work", "list_contacts"])).toBe(original);
  expect(fingerprintSuite(evalCases, ["list_work"])).not.toBe(original);
});
