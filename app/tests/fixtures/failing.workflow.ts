import { proxyActivities } from "@temporalio/workflow";

const { failWithMessage } = proxyActivities<{
  failWithMessage: (message: string) => Promise<void>;
}>({ startToCloseTimeout: "10 seconds", retry: { maximumAttempts: 1 } });

/** Fails in an activity with a caller-supplied message, to show where failure text is stored. */
export const failingProbe = async (input: { message: string }) => {
  await failWithMessage(input.message);
};
