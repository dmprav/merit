import type { OrganizationProblem } from "../api/result";

// Throw inside transactions so rejected operations roll back before becoming public results.
export class OrganizationError extends Error {
  readonly problem: OrganizationProblem;
  constructor(problem: OrganizationProblem) {
    super(problem);
    this.problem = problem;
  }
}

export const fail = (problem: OrganizationProblem): never => {
  throw new OrganizationError(problem);
};
