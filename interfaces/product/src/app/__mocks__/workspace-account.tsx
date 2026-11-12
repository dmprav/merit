import { ApplicationAccount } from "@merit/ui/application-shell";

// Storybook has no authenticated session. Keep the real account presentation with a fictional identity.
export const WorkspaceAccount = () => (
  <ApplicationAccount name="Dana Reed" loadingLabel="Loading account" menuLabel="Account menu" />
);
