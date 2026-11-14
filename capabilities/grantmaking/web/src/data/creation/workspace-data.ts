import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { normalizeMoneyInput } from "@merit/money/input";

import type { CreationData, CreationTarget, CreationTransport } from "../../contracts/creation";

type CreationSource = CreationTransport & {
  grantWorkScope: QueryKey;
  open: CreationData["open"];
};

export const createCreationData = (
  client: QueryClient,
  target: CreationTarget,
  source: CreationSource,
): CreationData => ({
  target,
  draftKey:
    target.kind === "round"
      ? `round:${target.workspaceSlug}`
      : `application:${target.workspaceSlug}/${target.roundPublicId}`,
  create: (value, materialLabel) =>
    target.kind === "round"
      ? source.createRound({
          workspaceSlug: target.workspaceSlug,
          requestId: value.requestId,
          title: value.title.trim(),
          purpose: value.body.trim(),
          budget: normalizeMoneyInput(value.amount.trim()),
          meetingDate: value.meetingDate || null,
        })
      : source.createApplication({
          workspaceSlug: target.workspaceSlug,
          publicId: target.roundPublicId,
          requestId: value.requestId,
          title: value.title.trim(),
          applicant: value.applicant.trim(),
          requested: normalizeMoneyInput(value.amount.trim()),
          answers: value.body.trim()
            ? [
                {
                  questionId: value.requestId,
                  question: materialLabel,
                  response: value.body.trim(),
                },
              ]
            : [],
        }),
  refresh: () =>
    client.invalidateQueries({ queryKey: source.grantWorkScope }, { throwOnError: true }),
  open: source.open,
});
