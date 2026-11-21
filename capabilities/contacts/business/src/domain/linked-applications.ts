/** An application related to a contact, with the application's position in its funding round. */
export type ApplicationLink = { contactId: string; id: string; title: string; position: number };

/**
 * Titles of the distinct applications each contact is related to, in round position order.
 * An application linked through several relationships appears once.
 */
export const linkedApplicationTitles = (links: readonly ApplicationLink[]) => {
  const byContact = new Map<string, Map<string, ApplicationLink>>();
  for (const link of links) {
    const linked = byContact.get(link.contactId) ?? new Map<string, ApplicationLink>();
    byContact.set(link.contactId, linked.set(link.id, link));
  }

  return new Map(
    [...byContact].map(([contactId, linked]) => [
      contactId,
      [...linked.values()]
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((link) => link.title),
    ]),
  );
};
