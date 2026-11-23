import { randomUUID } from "node:crypto";

import { assert, expect, onTestFinished, vi } from "vite-plus/test";
import { z } from "zod";

import { materialVersionSchema } from "@merit/applications/domain";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { withDatabase } from "@merit/db";
import { contactWork } from "@merit/grantmaking/testing/contact-work";
import { roundTest } from "@merit/grantmaking/testing/rounds";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { createAssistantHost } from "../src/server/assistant/host.server";
import type { AssistantCommand } from "../src/server/assistant/http.server";
import type { EmailSender } from "../src/server/email-delivery.server";

const it = roundTest.extend("committee", async ({ db, database, rounds }) => {
  const address = await rounds.createApplication("Community gardens");
  const assessmentId = randomUUID();
  const reviewers = [];
  for (const [index, name] of ["Alex", "Jo", "Sam", "Lee"].entries()) {
    const userId = name.toLowerCase();
    const email = userId + "@example.test";
    const contactId = randomUUID();
    const contact = await changeWorkspaceContact(
      db,
      actor,
      {
        workspaceSlug,
        contactId,
        action: "create",
        details: { name, email, affiliation: "" },
      },
      contactWork,
    );
    assert(contact.status === "ok");
    const basis = {
      ...address,
      expectedRevision: reviewRevisionSchema.parse(index),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
    };
    if (index === 0) {
      const assessment = await saveApplicationReview(db, actor, {
        ...basis,
        change: {
          action: "record",
          id: assessmentId,
          contactId,
          requestId: null,
          previousId: null,
          content: {
            applicationVersion: basis.expectedApplicationVersion,
            criteriaVersion: basis.expectedCriteriaVersion,
            date: null,
            position: null,
            amount: null,
            reasoning: "Volunteer cover needs clarification.",
            observations: [],
          },
        },
      });
      assert(assessment.status === "ok");
      continue;
    }
    await database.client.query(
      "insert into app_users (id, name, clerk_user_id) values ($1, $2, $1)",
      [userId, name],
    );
    await database.client.query(
      "insert into memberships (organization_id, user_id, email, role) values ('alder', $1, $2, 'reviewer')",
      [userId, email],
    );
    const requestId = randomUUID();
    const request = await saveApplicationReview(db, actor, {
      ...basis,
      change: { action: "request", id: requestId, contactId, replacesId: null },
    });
    assert(request.status === "ok");
    reviewers.push({ contactId, requestId, name, email });
  }
  return { applicationId: address.publicId, assessmentId, reviewers };
});

const calls = (...tools: Array<[string, Record<string, unknown>]>) =>
  Response.json({
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          content: null,
          tool_calls: tools.map(([name, input]) => ({
            type: "function",
            function: { name, arguments: JSON.stringify({ input }) },
          })),
        },
      },
    ],
  });
const answer = (content: string) =>
  Response.json({ choices: [{ finish_reason: "stop", message: { content } }] });

const source = z.object({
  kind: z.string(),
  recordId: z.string(),
  version: z.string(),
  key: z.string(),
});
const receipts = async (url: RequestInfo | URL, init?: RequestInit) => {
  const body = await new Request(url, init).json();
  const { messages } = z
    .object({ messages: z.array(z.object({ role: z.string(), content: z.string().nullable() })) })
    .parse(body);
  return messages
    .filter((m) => m.role === "tool")
    .map((m) =>
      z
        .object({ result: z.record(z.string(), z.unknown()), evidence: z.array(source) })
        .parse(JSON.parse(m.content ?? "")),
    );
};

const snapshot = z.object({
  id: z.string(),
  status: z.string(),
  messages: z.array(
    z.object({ role: z.string(), text: z.string(), citations: z.array(source).optional() }),
  ),
  groups: z.array(
    z.object({
      id: z.string(),
      actions: z.array(
        z.object({
          id: z.string(),
          status: z.string(),
          canRetry: z.boolean(),
          preview: z.object({
            name: z.string(),
            input: z.record(z.string(), z.unknown()),
            effects: z.array(z.string()),
            targets: z.array(z.unknown()),
          }),
        }),
      ),
    }),
  ),
});

it(
  "investigates committee evidence, previews three invitations, and recovers only the failed email after disconnect",
  { timeout: 30_000 },
  async ({ database, rounds, committee: { applicationId, assessmentId, reviewers } }) => {
    const fetchModel = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchModel);
    onTestFinished(() => vi.unstubAllGlobals());
    const attempts: Array<{ id: string; to: string }> = [];
    const delivered: string[] = [];
    const failedEmail = "sam@example.test";
    const sendEmail: EmailSender = async ({ id, to }) => {
      const firstAttempt = !attempts.some((attempt) => attempt.to === to);
      attempts.push({ id, to });
      if (to === failedEmail && firstAttempt) throw new Error("Temporary mail failure");
      delivered.push(to);
    };
    const runtime = await database.createRuntimeConnection();
    const host = createAssistantHost(
      {
        database: (operation) => withDatabase(runtime, operation),
        invitationOrigin: "https://merit.test",
        sendEmail,
      },
      { apiKey: "test", model: "scripted" },
    );
    onTestFinished(() => host.close());
    const command = (
      input: AssistantCommand,
      who = actor,
      workspace = workspaceSlug,
      signal = new AbortController().signal,
    ) => host.command(who, workspace, input, signal);
    const admin = { userId: "birch-manager" };
    expect((await command({ action: "set_consent", enabled: true })).status).toBe(403);
    expect((await command({ action: "set_consent", enabled: true }, admin, "birch")).status).toBe(
      200,
    );
    expect((await command({ action: "create" })).status).toBe(403);
    expect(fetchModel).not.toHaveBeenCalled();
    await database.client.query(
      "insert into memberships (organization_id, user_id, role, administration) values ('alder','birch-manager','member','administrator')",
    );
    expect((await command({ action: "set_consent", enabled: true }, admin)).status).toBe(200);
    const created = await command({ action: "create" });
    expect(created.status).toBe(201);
    const { id } = snapshot.parse(await created.json());
    const open = async () => snapshot.parse(await (await command({ action: "open", id })).json());
    const untilSettled = async () => {
      return vi.waitFor(
        async () => {
          const saved = await open();
          expect(saved.status).not.toBe("running");
          return saved;
        },
        { timeout: 10_000, interval: 50 },
      );
    };

    fetchModel
      .mockResolvedValueOnce(calls(["list_applications", { roundId: rounds.pageInput.publicId }]))
      .mockImplementationOnce(async (...args) => {
        const [listed] = await receipts(...args);
        const [app] = z
          .tuple([z.object({ applicationId: z.string(), applicationVersion: z.number() })])
          .parse(listed?.result.applications);
        return calls(
          [
            "get_application_content",
            {
              applicationId: app.applicationId,
              section: "material",
              materialVersion: app.applicationVersion,
            },
          ],
          ["list_application_reviews", { applicationId: app.applicationId }],
        );
      })
      .mockImplementationOnce(async (...args) => {
        const history = await receipts(...args);
        const reviews = z
          .array(z.object({ kind: z.string(), id: z.string() }))
          .parse(history.at(-1)?.result.reviews);
        const assessment = reviews.find((entry) => entry.kind === "assessment");
        assert(assessment);
        return calls([
          "get_application_content",
          { applicationId, section: "assessment", entryId: assessment.id },
        ]);
      })
      .mockImplementationOnce(async (...args) => {
        const history = await receipts(...args);
        expect(
          history.some((item) =>
            String(item.result.content).includes("Weekly community activities."),
          ),
        ).toBe(true);
        expect(history.at(-1)?.result.content).toContain("Volunteer cover needs clarification.");
        const sources = history.flatMap((item) => item.evidence);
        const material = sources.find((s) => s.kind === "material" && s.recordId === applicationId);
        const assessment = sources.find(
          (s) => s.kind === "assessment" && s.recordId === assessmentId,
        );
        assert(material && assessment);
        return answer(
          `The application proposes weekly activities [${material.key}]. Alex flagged volunteer cover [${assessment.key}].`,
        );
      });

    expect(
      (
        await command({
          action: "start",
          id,
          message: "Which applications need attention before committee?",
          page: `/app/alder/rounds/${rounds.pageInput.publicId}`,
        })
      ).status,
    ).toBe(202);
    const researched = await untilSettled();
    expect(researched.status).toBe("completed");
    expect(researched.messages.at(-1)).toMatchObject({
      role: "assistant",
      citations: [
        { kind: "material", recordId: applicationId, version: "1" },
        { kind: "assessment", recordId: assessmentId, version: "1" },
      ],
    });

    fetchModel.mockResolvedValueOnce(
      calls(
        ...reviewers.map(({ requestId }): [string, Record<string, unknown>] => [
          "invite_reviewer",
          { applicationId, requestId, commandId: randomUUID(), dueDate: null },
        ]),
      ),
    );
    expect(
      (
        await command({
          action: "start",
          id,
          message: "Invite Jo, Sam and Lee to review this application.",
        })
      ).status,
    ).toBe(202);
    const waiting = await untilSettled();
    expect(waiting.status).toBe("awaiting_approval");
    const [group] = waiting.groups;
    assert(group);
    expect(group.actions).toMatchObject(
      reviewers.map(({ requestId, contactId, email, name }) => ({
        status: "waiting",
        preview: {
          name: "invite_reviewer",
          input: { applicationId, requestId },
          effects: [`Send invitation email to ${email}.`],
          targets: expect.arrayContaining([
            expect.objectContaining({ kind: "contact", id: contactId, label: name }),
          ]),
        },
      })),
    );
    const invitationRows = async () =>
      (
        await database.client.query<{
          request_id: string;
          id: string | null;
          recipient: string | null;
          status: string | null;
        }>(
          "select a.request_id, m.id, m.recipient, m.status from review_assignments a left join reviewer_messages m on m.assignment_id=a.id where a.case_id=$1 order by m.recipient",
          [applicationId],
        )
      ).rows;
    expect(await invitationRows()).toEqual([]);
    expect(attempts).toEqual([]);

    const tab = new AbortController();
    expect(
      (
        await command(
          { action: "approve", id, previewId: group.id },
          actor,
          workspaceSlug,
          tab.signal,
        )
      ).status,
    ).toBe(202);
    tab.abort();
    await vi.waitFor(() => expect(attempts).toHaveLength(3), { timeout: 10_000 });
    const returned = await untilSettled();
    expect(returned.groups[0]?.actions.map((item) => item.status)).toEqual([
      "succeeded",
      "failed",
      "succeeded",
    ]);
    const failed = returned.groups[0]?.actions.find((item) => item.canRetry);
    assert(failed);
    const partial = await invitationRows();
    expect(partial).toMatchObject(
      [...reviewers]
        .sort((a, b) => a.email.localeCompare(b.email))
        .map(({ requestId, email }) => ({
          request_id: requestId,
          recipient: email,
          status: email === failedEmail ? "failed" : "sent",
        })),
    );
    expect(delivered).toEqual(["jo@example.test", "lee@example.test"]);

    fetchModel.mockImplementationOnce(async (...args) => {
      const sources = (await receipts(...args)).flatMap((item) => item.evidence);
      return answer(`Invitations delivered. ${sources.map((s) => `[${s.key}]`).join(" ")}`);
    });
    expect(
      (await command({ action: "retry", id, previewId: group.id, actionId: failed.id })).status,
    ).toBe(202);
    const completed = await untilSettled();
    expect(completed.status).toBe("completed");
    expect(completed.groups[0]?.actions.map((item) => item.status)).toEqual([
      "succeeded",
      "succeeded",
      "succeeded",
    ]);
    expect(await invitationRows()).toEqual(partial.map((row) => ({ ...row, status: "sent" })));
    const originalMessage = partial.find((row) => row.recipient === failedEmail);
    assert(originalMessage?.id);
    expect(attempts.filter((item) => item.to === failedEmail).map((item) => item.id)).toEqual([
      originalMessage.id,
      originalMessage.id,
    ]);
    expect(delivered.toSorted()).toEqual(reviewers.map((reviewer) => reviewer.email).toSorted());
  },
);
