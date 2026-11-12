import type { ReviewFormValues } from "./drafts";

type Observations = ReviewFormValues["observations"];

type Criteria = readonly { id: string; title: string }[];

const matchedObservation = (existing: Observations, criterion: Criteria[number]) =>
  existing.find((note) => note.criterionId === criterion.id);

/** Follow identities in the selected basis without relabeling or discarding received notes. */
export const reconcileObservations = (existing: Observations, criteria: Criteria): Observations => {
  const matched = new Set<Observations[number]>();
  const selected = criteria.map((criterion) => {
    const note = matchedObservation(existing, criterion);
    if (note) {
      matched.add(note);
      return note;
    }
    return { criterionId: criterion.id, criterion: criterion.title, text: "" };
  });
  return [...selected, ...existing.filter((note) => note.text.trim() && !matched.has(note))];
};

/** Opening optional notes fills missing criteria without rearranging existing writing. */
export const addCriterionObservations = (
  existing: Observations,
  criteria: Criteria,
): Observations => [
  ...existing,
  ...criteria
    .filter((criterion) => !matchedObservation(existing, criterion))
    .map((criterion) => ({
      criterionId: criterion.id,
      criterion: criterion.title,
      text: "",
    })),
];
