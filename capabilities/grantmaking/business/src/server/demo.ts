import { encodeApplicationMaterial } from "@merit/applications/encoding";
import { encodeApplicationHistory } from "@merit/applications/history";
import { insertIntakeHistory } from "@merit/applications/server/demo";
import { seedExampleContacts } from "@merit/contacts/server/demo";
import type { Database } from "@merit/db";
import { fromMinorUnits } from "@merit/money";
import { encodeRound } from "@merit/rounds/encoding";
import { insertPreparedRound } from "@merit/rounds/server/demo";

import { applicationRecordSchema } from "../domain/model";
import { exampleRound } from "../examples/example-data";
import { getExampleRound } from "../examples/get-example-round";
import { insertExampleApplication, deleteDemoFunding } from "./persistence/commands/demo";
import { decodeApplication, encodeRoundOverview } from "./persistence/encoding";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const exampleSeedVersion = 1;
export const fundingExampleAuthor = { id: "merit-example-author", name: exampleRound.manager };

/** Fixture labels stay in the scenario; each workspace gets its own stable record identities. */
export const fundingExampleIds = async (organizationId: string) => {
  const example = getExampleRound();

  const id = async (label: string) => {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([organizationId, label])),
    );
    return Array.from(new Uint8Array(hash).slice(0, 12), (byte) =>
      "0123456789abcdefghjkmnpqrstvwxyz".charAt(byte & 31),
    ).join("");
  };

  return {
    roundId: await id(example.id),
    applications: Object.fromEntries(
      await Promise.all(
        example.applications.map(
          async (application) => [application.id, await id(application.id)] as const,
        ),
      ),
    ),
  };
};

/** Seed authored fictional history, never attribute prepared work to the visitor. */
export const seedFundingExample = async (
  db: Transaction,
  organizationId: string,
  managerUserId: string,
  authorUserId: string,
) => {
  const example = getExampleRound();
  const ids = await fundingExampleIds(organizationId);
  const people = example.applications.flatMap((application) => [
    ...(application.contactId
      ? [
          {
            id: application.contactId,
            name: application.submission?.contact ?? "",
            email: application.submission?.contactEmail,
          },
        ]
      : []),
    ...[...application.reviews.requests, ...application.reviews.assessments].map((review) => ({
      id: review.contactId,
      name: review.reviewer,
    })),
  ]);
  const contactIds = await seedExampleContacts(db, organizationId, people);
  const { applications: items } = encodeRoundOverview(example);
  await insertPreparedRound(db, {
    organizationId,
    managerUserId,
    snapshot: encodeRound({ ...example, id: ids.roundId }),
  });

  for (const [position, application] of items.entries()) {
    const reviews = structuredClone(application.reviews);
    for (const review of [...reviews.requests, ...reviews.assessments]) {
      review.contactId = contactIds.get(review.contactId)!;
    }

    const content = {
      ...application,
      id: ids.applications[application.id]!,
      reviews,
      contactId: application.contactId ? contactIds.get(application.contactId)! : null,
    };
    const earlierMaterial =
      application.id === "A3" ? originalWorkshopMaterial(example, content) : undefined;
    const saved = await insertExampleApplication(db, {
      organizationId,
      roundId: ids.roundId,
      position,
      snapshot: content,
      revision: earlierMaterial ? 1 : 0,
      recordedByUserId: authorUserId,
      earlierMaterial: earlierMaterial
        ? [
            {
              content: encodeApplicationMaterial(earlierMaterial),
              reason: "The original request used a free venue.",
              recordedAt: new Date("2027-01-08T12:00:00Z"),
            },
          ]
        : [],
    });
    if (earlierMaterial) {
      await insertIntakeHistory(db, {
        organizationId,
        publicId: saved.id,
        revision: 1,
        actorUserId: authorUserId,
        action: "revision",
        recordedAt: new Date("2027-01-17T12:00:00Z"),
        reason: "The applicant lost the free venue and submitted a revised request.",
        before: encodeApplicationHistory({ application: earlierMaterial, workingRevision: null }),
        after: encodeApplicationHistory({
          application: decodeApplication(content),
          workingRevision: null,
        }),
      });
    }
  }
};

const originalWorkshopMaterial = (
  example: ReturnType<typeof getExampleRound>,
  content: ReturnType<typeof encodeRoundOverview>["applications"][number],
) => {
  const source = example.applications.find((item) => item.id === "A3")!;
  return applicationRecordSchema.parse({
    ...source,
    id: content.id,
    version: 1,
    requested: fromMinorUnits(1800000n),
    contactId: content.contactId,
    reviews: {
      ...content.reviews,
      requests: content.reviews.requests.filter((request) => request.applicationVersion === 1),
    },
    summary: "12 group repair workshops, with 27 expressions of interest and a free venue.",
    submission: {
      ...source.submission,
      version: 1,
      submittedOn: "2027-01-08",
      answers: source.submission!.answers.map((answer) =>
        answer.question === "Revised venue and funding request"
          ? {
              ...answer,
              question: "Venue and funding request",
              response:
                "A free venue is available for our 12 workshops. We request €18,000 for facilitators, coordination, materials and participant support.",
            }
          : answer.question === "Submitted budget breakdown (EUR)"
            ? {
                ...answer,
                response: answer.response
                  .split("\n")
                  .filter((line) => !line.startsWith("Replacement venue"))
                  .join("\n"),
              }
            : answer,
      ),
    },
    evidence: [
      {
        version: 1,
        passage:
          "We request €18,000 for 12 workshops. A free venue is available and 27 people have expressed interest.",
      },
    ],
    managerRecommendation: null,
    attention: [],
  });
};

/** Called only while the organizations module holds an expired-demo lock. */
export const removeDemoFunding = (db: Transaction, organizationId: string) =>
  deleteDemoFunding(db, organizationId);
