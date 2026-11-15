import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { useTranslation } from "react-i18next";

import { ApplicationAccount } from "@merit/ui/application-shell";

const localPersonas = new Map<string, string>([
  ["reviewer", "Robin Ellis"],
  ["recipient", "Invitation recipient"],
  ["operator", "Merit operator"],
]);
const defaultLocalPersona = "Dana Reed";

const readLocalPersonCookie = createIsomorphicFn()
  .server(() => getCookie("merit-local-person"))
  .client(
    () =>
      document.cookie
        .split(";")
        .map((value) => value.trim())
        .find((value) => value.startsWith("merit-local-person="))
        ?.split("=")[1],
  );

export const LocalAccount = () => {
  const { t } = useTranslation("common");
  const person = readLocalPersonCookie();
  const name = (person ? localPersonas.get(person) : undefined) ?? defaultLocalPersona;

  return (
    <ApplicationAccount
      name={name}
      loadingLabel={t("loadingAccount")}
      menuLabel={t("accountMenu")}
    />
  );
};
