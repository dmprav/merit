export const localPersonCookie = "merit-local-person";

export const localPersonas = [
  { id: "manager", name: "Dana Reed", email: "dana@example.test" },
  { id: "reviewer", name: "Robin Ellis", email: "reviewer@example.test" },
  { id: "operator", name: "Merit operator", email: "operator@example.test" },
  { id: "recipient", name: "Invitation recipient", email: "recipient@example.test" },
] as const;

export const defaultLocalPersona = localPersonas[0];

export const localPersona = (id: string | undefined) =>
  localPersonas.find((person) => person.id === id) ?? defaultLocalPersona;

export const readLocalPersonCookie = (cookies: string | null) => {
  const prefix = `${localPersonCookie}=`;
  return cookies
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
};
