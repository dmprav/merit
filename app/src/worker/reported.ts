import { reportError } from "@merit/telemetry/errors";

/**
 * Report an activity's failure by its safe operation name, then rethrow so Temporal's retry
 * policy still decides what happens. The report never carries the failure text: it can hold
 * addresses, names or content.
 */
export const reported =
  <Arguments extends unknown[], Result>(
    operation: string,
    activity: (...args: Arguments) => Promise<Result>,
  ) =>
  async (...args: Arguments): Promise<Result> => {
    try {
      return await activity(...args);
    } catch (error) {
      reportError(new Error("Background work could not complete."), {
        surface: "server",
        operation,
      });
      throw error;
    }
  };
