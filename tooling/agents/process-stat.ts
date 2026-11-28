import { readdirSync, readFileSync } from "node:fs";

/** The fields of a Linux `/proc/<pid>/stat` line that tooling reads. */
export type ProcessStat = {
  /** One letter, such as `R` running, `S` sleeping, or `Z` exited but not yet reaped. */
  state: string;
  parentPid: number;
  processGroup: number;
  session: number;
  /** Clock ticks after boot at which the process started (field 22). */
  startTicks: string;
};

/**
 * Parses a `/proc/<pid>/stat` line. The command name in parentheses can contain spaces and
 * parentheses, so fields are read after its last closing parenthesis, starting at field 3.
 */
export const parseProcessStat = (line: string): ProcessStat | undefined => {
  const commandEnd = line.lastIndexOf(")");
  if (commandEnd < 0) {
    return undefined;
  }
  const fields = line.slice(commandEnd + 2).split(" ");
  const [state, parentPid, processGroup, session] = fields;
  const startTicks = fields[19];
  if (!state || !startTicks) {
    return undefined;
  }
  return {
    state,
    parentPid: Number(parentPid),
    processGroup: Number(processGroup),
    session: Number(session),
    startTicks,
  };
};

/**
 * Whether the process has exited and only awaits its parent's reaping. Such a zombie (`Z`) or
 * dead (`X`) entry keeps its pid and group but holds no memory, files, ports, or pipes.
 */
export const hasProcessExited = ({ state }: ProcessStat): boolean => state === "Z" || state === "X";

/** The outcome of reading a process's stat line. */
export type ProcessStatReading =
  | { kind: "read"; stat: ProcessStat }
  /** The process has exited and been reaped. */
  | { kind: "gone" }
  /** The process may exist but its entry cannot be read or parsed. */
  | { kind: "unreadable" };

type ProcessFileReaders = {
  readFile?: (path: string) => string;
  listDirectory?: (path: string) => string[];
};

const readTextFile = (path: string): string => readFileSync(path, "utf8");

const readStat = (path: string, readFile: (path: string) => string): ProcessStatReading => {
  let line: string;
  try {
    line = readFile(path);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    return code === "ENOENT" || code === "ESRCH" ? { kind: "gone" } : { kind: "unreadable" };
  }
  const stat = parseProcessStat(line);
  return stat ? { kind: "read", stat } : { kind: "unreadable" };
};

/** Reads `/proc/<pid>/stat`, telling a reaped process apart from an entry that cannot be read. */
export const readProcessStat = (
  pid: number | string,
  readFile: (path: string) => string = readTextFile,
): ProcessStatReading => readStat(`/proc/${pid}/stat`, readFile);

/**
 * Whether any thread of the process has not exited. A process whose main thread exited while
 * its other threads still run reports itself as a zombie, but those threads are listed under
 * `/proc/<pid>/task` and still hold its resources.
 */
export const hasLiveThread = (
  pid: number | string,
  { readFile = readTextFile, listDirectory = readdirSync }: ProcessFileReaders = {},
): boolean => {
  let threads: string[];
  try {
    threads = listDirectory(`/proc/${pid}/task`);
  } catch {
    return false;
  }
  return threads.some((thread) => {
    const reading = readStat(`/proc/${pid}/task/${thread}/stat`, readFile);
    return (
      reading.kind === "unreadable" || (reading.kind === "read" && !hasProcessExited(reading.stat))
    );
  });
};

/**
 * Whether the process is in the process group `pgid` that the leader of session `pgid` leads,
 * as a detached spawn does. A group's members always share its leader's session, so a process
 * in another session belongs to an unrelated group.
 */
export const isProcessGroupMember = (stat: ProcessStat, pgid: number): boolean =>
  stat.processGroup === pgid && stat.session === pgid;
