import { type Actor } from "@merit/auth";
import { readContact } from "@merit/contacts/scope";
import type { Database } from "@merit/db";
import { lockGrantWorkspace } from "@merit/organizations/locks";
import { lockPreparationRound } from "@merit/rounds/locks";

import {
  createApplicationRequestSchema,
  editApplicationRequestSchema,
  type CreateApplicationRequest,
  type EditApplicationRequest,
} from "../../api/commands/intake";
import { prepareIntakeChange } from "../../domain/intake";
import {
  newIntakeApplication,
  requestedTotalProblem,
  withIntakeContact,
} from "../../domain/intake-recording";
import { isWithdrawn } from "../../domain/model";
import type { ApplicationWork } from "../grant-work";
import {
  findIntakeApplication,
  recordIntakeCreation,
  recordIntakeChange,
  readRequestedAmounts,
} from "../persistence/commands/intake";
import { intakeCreationReceipt } from "../persistence/commands/intake-history";
import { lockApplicationCase } from "../persistence/commands/locks";
import { allocatePublicId } from "../persistence/identifiers";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const resolveIntakeContactChange = async (
  tx: Transaction,
  organizationId: string,
  currentContactId: string | null | undefined,
  change: EditApplicationRequest["change"],
) => {
  const contactId =
    change.action === "save_content" || change.action === "save_revision"
      ? change.contactId
      : undefined;
  if (contactId === undefined || contactId === (currentContactId ?? null)) {
    return { status: "unchanged" } as const;
  }
  if (contactId === null) {
    return { status: "changed", contactId, contact: null } as const;
  }

  const contact = await readContact(tx, organizationId, contactId);
  if (!contact || contact.archived) {
    return { status: "invalid", error: "contact_unavailable" } as const;
  }
  return { status: "changed", contactId, contact } as const;
};

export const createFundingApplication = async (
  db: Database,
  actor: Actor,
  input: CreateApplicationRequest,
) => {
  const parsed = createApplicationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_application" } as const;
  }

  const request = parsed.data;
  return db.transaction(async (tx) => {
    const access = await lockGrantWorkspace(tx, actor.userId, request.workspaceSlug, "update");
    if (!access) {
      return { status: "not_found" } as const;
    }

    const round = await lockPreparationRound(tx, access.organization.id, request.publicId);
    if (!round) {
      return { status: "not_found" } as const;
    }

    const receipt = await intakeCreationReceipt(tx, access.organization.id, request.requestId);
    if (receipt) {
      const row = await findIntakeApplication(tx, access.organization.id, receipt.publicId);
      return row && row.roundId === round.id
        ? ({ status: "ok", publicId: row.id } as const)
        : ({ status: "invalid", error: "application_deleted" } as const);
    }

    const application = newIntakeApplication(await allocatePublicId(tx), request);
    if (application.requested !== null) {
      const amounts = await readRequestedAmounts(tx, access.organization.id, round.id);
      const problem = requestedTotalProblem(amounts, application);
      if (problem) {
        return { status: "invalid", error: problem } as const;
      }
    }

    const publicId = await recordIntakeCreation(
      tx,
      access.organization.id,
      round.id,
      application,
      actor,
      request.requestId,
    );
    return { status: "ok", publicId } as const;
  });
};

export const editFundingApplication = async (
  db: Database,
  actor: Actor,
  input: EditApplicationRequest,
  work: ApplicationWork,
) => {
  const parsed = editApplicationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_application" } as const;
  }

  const request = parsed.data;

  const editIntakeTransaction = async (tx: Transaction) => {
    // Amount changes coordinate round totals; other edits lock only this case for writing.
    const access = await lockApplicationCase(
      tx,
      actor.userId,
      request,
      amountChanges(request.change) ? "update" : "share",
    );
    if (!access) {
      return { status: "not_found" } as const;
    }

    const row = await findIntakeApplication(tx, access.organizationId, request.publicId);
    if (!row) {
      return { status: "not_found" } as const;
    }
    if (row.revision !== request.expectedRevision) {
      return { status: "conflict" } as const;
    }

    const { application, workingRevision: draft } = row;
    const author = intakeAuthor(access.actor);
    // A withdrawn case rejects every change but reinstatement before contact eligibility matters.
    if (isWithdrawn(application) && request.change.action !== "reinstate") {
      return { status: "invalid", error: "application_withdrawn" } as const;
    }
    const contactChange = await resolveIntakeContactChange(
      tx,
      access.organizationId,
      application.contactId,
      request.change,
    );
    if (contactChange.status === "invalid") {
      return contactChange;
    }

    const result = prepareIntakeChange(
      application,
      draft,
      request.change,
      author,
      request.change.action === "delete"
        ? await work.usage(tx, access.organizationId, request.publicId)
        : { hasReviews: false, hasRecommendation: false },
    );
    if (!result.ok) {
      return { status: "invalid", error: result.error } as const;
    }
    const problem = await intakeTotalProblem(tx, work, row, request.change, result.application);
    if (problem) {
      return { status: "invalid", error: problem } as const;
    }

    const revision = await recordIntakeChange(
      tx,
      row,
      {
        ...result,
        application:
          contactChange.status === "changed"
            ? withIntakeContact(result.application, contactChange.contactId, contactChange.contact)
            : result.application,
      },
      actor,
    );
    await closeReviewsOnWithdrawal(tx, work, request, { actor, name: author.name });

    return { status: "ok", revision } as const;
  };

  return db.transaction(editIntakeTransaction);
};

const intakeAuthor = (person: { userId: string; name: string | null; email: string | null }) => ({
  userId: person.userId,
  name: person.name ?? person.email ?? "",
  recordedAt: new Date().toISOString(),
});

const closeReviewsOnWithdrawal = async (
  tx: Transaction,
  work: ApplicationWork,
  request: EditApplicationRequest,
  closing: { actor: Actor; name: string },
) => {
  if (request.change.action === "withdraw") {
    await work.closeReviewsForWithdrawal(tx, { ...closing, caseId: request.publicId });
  }
};

const amountChanges = (change: EditApplicationRequest["change"]) =>
  change.action === "save_content" ||
  change.action === "publish_revision" ||
  change.action === "reinstate";

const intakeTotalProblem = async (
  tx: Transaction,
  work: ApplicationWork,
  row: NonNullable<Awaited<ReturnType<typeof findIntakeApplication>>>,
  change: EditApplicationRequest["change"],
  application: Parameters<typeof requestedTotalProblem>[1],
) => {
  if (row.roundId === null || !amountChanges(change)) {
    return null;
  }

  const requests = await readRequestedAmounts(tx, row.organizationId, row.roundId);
  const problem = requestedTotalProblem(requests, application);
  if (problem || change.action !== "reinstate") {
    return problem;
  }
  // A reinstated recommendation counts toward the round's proposed allocations again.
  return work.allocationTotalProblem(tx, {
    organizationId: row.organizationId,
    roundId: row.roundId,
    caseId: row.id,
  });
};
