import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  date,
  timestamp,
  jsonb,
  foreignKey,
  unique,
  check,
  index,
} from "drizzle-orm/pg-core";

import { applicationCases } from "@merit/applications/schema";
import type { Provenance } from "@merit/auth";
import { appUsers } from "@merit/auth/schema";

import type { ReviewerDraft, ReviewerStatus } from "../../domain/reviewer";
import { reviewRequests, assessments } from "./schema";

export const reviewAssignments = pgTable(
  "review_assignments",
  {
    id: uuid().primaryKey(),
    organizationId: text("organization_id").notNull(),
    caseId: text("case_id").notNull(),
    requestId: text("request_id").notNull(),
    email: text().notNull(),
    reviewerUserId: text("reviewer_user_id").references(() => appUsers.id),
    membershipId: uuid("membership_id"),
    managerUserId: text("manager_user_id")
      .notNull()
      .references(() => appUsers.id),
    managerName: text("manager_name").notNull(),
    managerEmail: text("manager_email").notNull(),
    dueDate: date("due_date"),
    status: text().$type<ReviewerStatus>().notNull().default("invited"),
    revision: integer().notNull().default(0),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    assessmentId: text("assessment_id"),
    conflict: text().notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("review_assignments_request_key").on(t.caseId, t.requestId),
    foreignKey({
      columns: [t.organizationId, t.caseId],
      foreignColumns: [applicationCases.organizationId, applicationCases.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.caseId, t.requestId],
      foreignColumns: [reviewRequests.caseId, reviewRequests.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.caseId, t.assessmentId],
      foreignColumns: [assessments.caseId, assessments.id],
    }),
    check(
      "review_assignment_status",
      sql`${t.status} IN ('invited','accepted','submitted','conflict','cancelled','declined')`,
    ),
    check("review_assignment_revision", sql`${t.revision} >= 0`),
    check(
      "review_assignment_identity",
      sql`${t.status} NOT IN ('accepted', 'submitted') OR (${t.reviewerUserId} IS NOT NULL AND ${t.acceptedAt} IS NOT NULL)`,
    ),
    check(
      "review_assignment_submission",
      sql`${t.status} <> 'submitted' OR ${t.assessmentId} IS NOT NULL`,
    ),
    index("review_assignments_reviewer").on(t.reviewerUserId),
    index("review_assignments_email").on(t.email),
  ],
);

export const reviewerDrafts = pgTable(
  "reviewer_drafts",
  {
    assignmentId: uuid("assignment_id")
      .primaryKey()
      .references(() => reviewAssignments.id, { onDelete: "cascade" }),
    revision: integer().notNull().default(0),
    content: jsonb().$type<ReviewerDraft>().notNull(),
    lastCommandId: uuid("last_command_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("reviewer_draft_revision", sql`${t.revision} >= 0`)],
);

export const reviewerEvents = pgTable(
  "reviewer_events",
  {
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => reviewAssignments.id, { onDelete: "cascade" }),
    commandId: uuid("command_id").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => appUsers.id),
    actorName: text("actor_name").notNull(),
    provenance: jsonb().$type<Provenance>().notNull(),
    action: text().notNull(),
    note: text().notNull().default(""),
    resultRevision: integer("result_revision").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("reviewer_events_command_key").on(t.assignmentId, t.commandId)],
);

export const reviewerMessages = pgTable(
  "reviewer_messages",
  {
    id: uuid().primaryKey(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => reviewAssignments.id, { onDelete: "cascade" }),
    kind: text({ enum: ["invitation", "submission"] }).notNull(),
    recipient: text().notNull(),
    status: text({ enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviewer_messages_assignment").on(t.assignmentId)],
);
