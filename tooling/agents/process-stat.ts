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
