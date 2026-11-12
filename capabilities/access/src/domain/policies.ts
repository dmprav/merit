/** Facts from current membership, never permission claims copied from a session. */
export type OrganizationSubject = {
  userId: string;
  organizationId: string;
  active: boolean;
  administration: "none" | "administrator" | "owner";
  role: "member" | "program_manager" | "reviewer" | "committee_reader";
};

export type Subject = Partial<OrganizationSubject> & { operator?: boolean };

export type Resource = Partial<
  Pick<OrganizationSubject, "organizationId" | "userId" | "administration">
> & {
  reviewerUserId?: string | null;
  reviewStatus?: "invited" | "accepted" | "submitted" | "conflict" | "cancelled" | "declined";
  reviewMembershipCurrent?: boolean;
};

export type Attributes = {
  [Key in keyof Subject as `subject.${Key}`]: Subject[Key];
} & {
  [Key in keyof Resource as `resource.${Key}`]: Resource[Key];
};

type Attribute = keyof Attributes;

type Requirement =
  | {
      [Key in Attribute]-?: { attribute: Key; values: readonly NonNullable<Attributes[Key]>[] };
    }[Attribute]
  | { attribute: Attribute; equals: Attribute }
  | { attribute: Attribute; differsFrom: Attribute };

// An action permits any alternative whose requirements all match.
type Policy = readonly (readonly Requirement[])[];

const workspace: Requirement[] = [
  { attribute: "subject.active", values: [true] },
  { attribute: "subject.organizationId", equals: "resource.organizationId" },
];
const administrators: Requirement = {
  attribute: "subject.administration",
  values: ["owner", "administrator"],
};
const owner: Requirement = { attribute: "subject.administration", values: ["owner"] };
const anotherMember: Requirement = {
  attribute: "subject.userId",
  differsFrom: "resource.userId",
};
const notOwner: Requirement = {
  attribute: "resource.administration",
  values: ["none", "administrator"],
};

const policies = {
  administer_organizations: [[{ attribute: "subject.operator", values: [true] }]],
  read_workspace: [workspace],
  manage_members: [[...workspace, administrators]],
  manage_administrators: [[...workspace, owner]],
  work_on_grants: [[...workspace, { attribute: "subject.role", values: ["program_manager"] }]],
  work_on_review: [
    [
      { attribute: "subject.active", values: [true] },
      { attribute: "subject.userId", equals: "resource.reviewerUserId" },
      { attribute: "resource.reviewStatus", values: ["accepted", "submitted"] },
      { attribute: "resource.reviewMembershipCurrent", values: [true] },
    ],
  ],
  remove_member: [
    [...workspace, owner, anotherMember, notOwner],
    [
      ...workspace,
      administrators,
      anotherMember,
      { attribute: "resource.administration", values: ["none"] },
    ],
  ],
  change_administration: [[...workspace, owner, anotherMember, notOwner]],
  manage_invitation: [
    [...workspace, administrators, { attribute: "resource.administration", values: ["none"] }],
    [
      ...workspace,
      owner,
      { attribute: "resource.administration", values: ["administrator", "owner"] },
    ],
  ],
} satisfies Record<string, Policy>;

export type AccessAction = keyof typeof policies;

// Unknown actions deny access, including inherited object property names.
export const policyFor = (action: AccessAction): Policy =>
  Object.hasOwn(policies, action) ? policies[action] : [];
