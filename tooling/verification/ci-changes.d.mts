export type WorkspacePackage = {
  name: string;
  dir: string;
  deps: string[];
};

export type ChangeClassification = {
  renovate: boolean;
  docs_only: boolean;
  renovate_only: boolean;
  full_run: boolean;
  run_app: boolean;
  run_storybook: boolean;
  run_tooling: boolean;
  run_package_tests: boolean;
  package_filters: string;
};

export function loadWorkspacePackages(repoRoot: string): WorkspacePackage[];

export function classifyChangedFiles(input: {
  eventName: string;
  changedFiles: string[];
  workspacePackages: WorkspacePackage[];
}): ChangeClassification;
