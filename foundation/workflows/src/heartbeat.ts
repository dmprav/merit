import { Context } from "@temporalio/activity";

/**
 * Run long activity work while reporting that this process is alive. With a heartbeat timeout on
 * the activity, Temporal then notices a dead worker within that timeout instead of waiting for
 * the whole start-to-close timeout. Outside an activity, such as in a unit test, it only runs
 * the work. Temporal delivers a cancellation with the next heartbeat's answer, so the work
 * receives the activity's cancellation signal and a cancelled workflow step ends within about
 * one heartbeat.
 */
export const withHeartbeat = async <T>(
  work: (cancellation?: AbortSignal) => Promise<T>,
  everyMs = 5000,
): Promise<T> => {
  let context: Context;
  try {
    context = Context.current();
  } catch {
    return work();
  }
  const timer = setInterval(() => context.heartbeat(), everyMs);
  try {
    return await work(context.cancellationSignal);
  } finally {
    clearInterval(timer);
  }
};
