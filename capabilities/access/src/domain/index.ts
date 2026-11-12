import {
  policyFor,
  type Attributes,
  type AccessAction,
  type Subject,
  type Resource,
  type OrganizationSubject,
} from "./policies";

export type { AccessAction, OrganizationSubject } from "./policies";

/** Missing required facts deny access. Browser decisions guide UI; servers recheck current facts. */
export const permits = (
  subject: Subject | null | undefined,
  action: AccessAction,
  resource?: Resource,
) => {
  const attributes: Attributes = {
    "subject.userId": subject?.userId,
    "subject.organizationId": subject?.organizationId,
    "subject.active": subject?.active,
    "subject.administration": subject?.administration,
    "subject.role": subject?.role,
    "subject.operator": subject?.operator,
    "resource.organizationId": resource?.organizationId,
    "resource.userId": resource?.userId,
    "resource.administration": resource?.administration,
    "resource.reviewerUserId": resource?.reviewerUserId,
    "resource.reviewStatus": resource?.reviewStatus,
    "resource.reviewMembershipCurrent": resource?.reviewMembershipCurrent,
  };

  return policyFor(action).some((requirements) =>
    requirements.every((requirement) => {
      const value = attributes[requirement.attribute];
      if (value == null) {
        return false;
      }
      if ("values" in requirement) {
        return requirement.values.some((allowed) => allowed === value);
      }

      const other =
        attributes["equals" in requirement ? requirement.equals : requirement.differsFrom];
      if (other == null) {
        return false;
      }

      return "equals" in requirement ? value === other : value !== other;
    }),
  );
};

type Member = Pick<OrganizationSubject, "userId" | "organizationId" | "administration">;

type Access = Pick<OrganizationSubject, "administration" | "role">;

type TeamAccess = {
  administration: "none" | "administrator";
  role: "member" | "program_manager";
};

export const memberActions = (actor: OrganizationSubject, target: Member) => ({
  canEdit: permits(actor, "manage_members", target),
  canRemove: permits(actor, "remove_member", target),
  canChangeAdministration: permits(actor, "change_administration", target),
});

type MemberAccess =
  | { status: "forbidden" | "owner_protected" | "self_change" }
  | { status: "ok"; value: Access | null };

/** A null change removes membership; Team's administrator input preserves an existing owner. */
export const evaluateMemberAccess = (
  actor: OrganizationSubject,
  target: Member,
  change: TeamAccess | null,
): MemberAccess => {
  const allowed = memberActions(actor, target);
  if (!allowed.canEdit) {
    return { status: "forbidden" };
  }
  if (target.administration === "owner" && change?.administration !== "administrator") {
    return { status: "owner_protected" };
  }
  if (
    target.userId === actor.userId &&
    (!change || (target.administration !== "none" && change.administration === "none"))
  ) {
    return { status: "self_change" };
  }
  if (!change && !allowed.canRemove) {
    return { status: "forbidden" };
  }
  if (
    change &&
    target.administration !== "owner" &&
    target.administration !== change.administration &&
    !allowed.canChangeAdministration
  ) {
    return { status: "forbidden" };
  }

  return {
    status: "ok",
    value: change
      ? {
          role: change.role,
          administration: target.administration === "owner" ? "owner" : change.administration,
        }
      : null,
  };
};
