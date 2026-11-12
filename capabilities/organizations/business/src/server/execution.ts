import { permits } from "@merit/access";
import type { Actor } from "@merit/auth";

import type { Result } from "../api/result";
import type { Dependencies } from "./dependencies";
import { OrganizationError } from "./result";

export const createExecution = (dependencies: Pick<Dependencies, "isOperator">) => {
  const canAdminister = (actor: Actor) =>
    permits({ operator: dependencies.isOperator(actor) }, "administer_organizations");

  const run = async <T>(
    actor: Actor,
    operator: boolean,
    operation: () => Promise<T>,
  ): Promise<Result<T>> => {
    try {
      if (operator && !canAdminister(actor)) {
        return { status: "forbidden" };
      }
      return { status: "ok", value: await operation() };
    } catch (error) {
      if (error instanceof OrganizationError) {
        return { status: error.problem };
      }
      throw error;
    }
  };

  return { canAdminister, run };
};
