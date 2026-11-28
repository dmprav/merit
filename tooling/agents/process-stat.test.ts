import { describe, expect, it } from "vite-plus/test";

import { hasProcessExited, parseProcessStat } from "./process-stat.ts";

const statLine = (command: string, state: string) =>
  `4242 (${command}) ${state} 1 4200 4100 0 -1 4194560 120 0 0 0 1 2 0 0 20 0 1 0 987654 1000 10`;

describe("parseProcessStat", () => {
  it("reads the fields after a command name that contains spaces and parentheses", () => {
    expect(parseProcessStat(statLine("vite (dev) ) S", "S"))).toEqual({
      state: "S",
      parentPid: 1,
      processGroup: 4200,
      session: 4100,
      startTicks: "987654",
    });
  });

  it("rejects a line without the fields it reads", () => {
    expect(parseProcessStat("4242 (node) S 1 4200")).toBeUndefined();
    expect(parseProcessStat("")).toBeUndefined();
  });
});

describe("hasProcessExited", () => {
  it("counts an unreaped zombie or a dead entry as exited, and nothing else", () => {
    const exited = (state: string) => hasProcessExited(parseProcessStat(statLine("node", state))!);

    expect(exited("Z")).toBe(true);
    expect(exited("X")).toBe(true);
    expect(["R", "S", "D", "T", "I"].map(exited)).toEqual([false, false, false, false, false]);
  });
});
