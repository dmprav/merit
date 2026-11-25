/** Activities run in the worker process with full Node.js access, outside the workflow sandbox. */

export const confirmWorkerHealth = async (probeId: string) => {
  void probeId;
  return "ok" as const;
};
