import { type Actor } from "@merit/auth";
import { lockContactProfile } from "@merit/contacts/locks";
import { allocatePublicId, type Database, type Transaction } from "@merit/db";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";
import { writeObservedWorkspace, writeWorkspace } from "@merit/organizations/transactions";
import { lockPreparationRoundAccess } from "@merit/rounds/locks";

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
import { isWithdrawn, type ApplicationUsage } from "../../domain/model";
import type { ApplicationWork } from "../grant-work";
import {
  findIntakeApplication,
  findLockedIntakeApplication,
  recordIntakeCreation,
  recordIntakeChange,
  readRequestedAmounts,
} from "../persistence/commands/intake";
import { intakeCreationReceipt } from "../persistence/commands/intake-history";
import { lockApplicationCase, type LockedApplicationCase } from "../persistence/commands/locks";
import { canAttachApplicationPdfs, bindApplicationPdfs } from "../persistence/commands/pdfs";

const attachEditPdfs = async (
  access: LockedApplicationCase,
  userId: string,
  change: EditApplicationRequest["change"],
) => {
  const pdfs =
    change.action === "save_content"
      ? change.content.pdfs
      : change.action === "save_revision"
        ? change.draft.content.pdfs
        : undefined;
  if (!pdfs?.length) {
    return true;
  }
  if (!(await canAttachApplicationPdfs(access.tx, { ...access, userId }, pdfs))) {
    return false;
  }
  await bindApplicationPdfs(access.tx, access.caseId, pdfs);
  return true;
};

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

  const contact = await lockContactProfile(tx, organizationId, contactId, "share");
  if (!contact || contact.archived) {
    return { status: "invalid", error: "contact_unavailable" } as const;
  }
  return { status: "changed", contactId, contact } as const;
};

export const createFundingApplication = async (
  db: Database,
  actor: Actor,
  input: CreateApplicationRequest,
  onCommitted?: WorkspaceChangeObserver,
) => {
  const parsed = createApplicationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", error: "invalid_application" } as const;
  }

  const request = parsed.data;
  return writeObservedWorkspace(db, actor, request, onCommitted, async (tx, changed) => {
    const round = await lockPreparationRoundAccess(tx, actor.userId, request);
    if (!round) {
      return { status: "not_found" } as const;
    }

    const receipt = await intakeCreationReceipt(tx, round.organizationId, request.requestId);
    if (receipt) {
      const row = await findIntakeApplication(tx, round.organizationId, receipt.publicId);
      return row && row.roundId === round.id
        ? ({ status: "ok", publicId: row.id } as const)
        : ({ status: "invalid", error: "application_deleted" } as const);
    }

    const application = newIntakeApplication(await allocatePublicId(tx), request);
    if (application.requested !== null) {
      const amounts = await readRequestedAmounts(round);
      const problem = requestedTotalProblem(amounts, application);
      if (problem) {
        return { status: "invalid", error: problem } as const;
      }
    }

    const pdfs = request.pdfs ?? [];
    if (
      !(await canAttachApplicationPdfs(
        tx,
        {
          organizationId: round.organizationId,
          roundId: round.roundId,
          caseId: null,
          userId: actor.userId,
        },
        pdfs,
      ))
    ) {
      return { status: "invalid", error: "invalid_application" } as const;
    }
    const publicId = await recordIntakeCreation(round, application, actor, request.requestId);
    // Same-round retries saw the receipt above while holding the round lock.
    // A conflict here means a different round committed this request ID first.
    if (!publicId) {
      return { status: "invalid", error: "application_deleted" } as const;
    }
    await bindApplicationPdfs(tx, publicId, pdfs);
    changed(round.organizationId, round.organizationKind);
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

    const row = await findLockedIntakeApplication(access);
    if (!row) {
      return { status: "not_found" } as const;
    }
    if (request.change.action !== "details" && row.revision !== request.expectedRevision) {
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
      request.change.action === "delete" || request.change.action === "withdraw"
        ? await applicationUsage(access, work)
        : { hasReviews: false, hasRecommendation: false, hasDecision: false, hasCommitment: false },
    );
    if (!result.ok) {
      return { status: "invalid", error: result.error } as const;
    }
    const problem = await intakeTotalProblem(access, work, request.change, result.application);
    if (problem) {
      return { status: "invalid", error: problem } as const;
    }

    if (!(await attachEditPdfs(access, actor.userId, request.change))) {
      return { status: "invalid", error: "invalid_application" } as const;
    }
    const revision = await recordIntakeChange(
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
    if (request.change.action === "withdraw") {
      await work.reviews.closeForWithdrawal(access, { actor, name: author.name });
    }

    return { status: "ok", revision } as const;
  };

  return writeWorkspace(db, actor.userId, request.workspaceSlug, editIntakeTransaction);
};

const intakeAuthor = (person: { userId: string; name: string | null; email: string | null }) => ({
  userId: person.userId,
  name: person.name ?? person.email ?? "",
  recordedAt: new Date().toISOString(),
});

const applicationUsage = async (
  locked: LockedApplicationCase,
  work: ApplicationWork,
): Promise<ApplicationUsage> => ({
  hasReviews: await work.reviews.hasActivity(locked),
  hasRecommendation: await work.recommendations.hasRecommendation(locked),
  hasDecision: await work.decisions.hasDecision(locked),
  hasCommitment: await work.decisions.hasCommitment(locked),
});

const amountChanges = (change: EditApplicationRequest["change"]) =>
  change.action === "save_content" ||
  change.action === "publish_revision" ||
  change.action === "reinstate";

const intakeTotalProblem = async (
  locked: LockedApplicationCase,
  work: ApplicationWork,
  change: EditApplicationRequest["change"],
  application: Parameters<typeof requestedTotalProblem>[1],
) => {
  if (!amountChanges(change)) {
    return null;
  }

  const requests = await readRequestedAmounts(locked);
  const problem = requestedTotalProblem(requests, application);
  if (problem || change.action !== "reinstate") {
    return problem;
  }
  // A reinstated recommendation counts toward the round's proposed allocations again.
  return work.recommendations.allocationTotalProblem(locked);
};
