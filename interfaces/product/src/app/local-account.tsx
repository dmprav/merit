import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApplicationAccount } from "@merit/ui/application-shell";

const localPersonas: Record<string, string> = {
  recipient: "Invitation recipient",
  operator: "Merit operator",
};
const defaultLocalPersona = "Dana Reed";

const readLocalPersonCookie = () =>
  document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("merit-local-person="))
    ?.split("=")[1];

export const LocalAccount = () => {
  const { t } = useTranslation("common");
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const person = readLocalPersonCookie();
    setName((person && localPersonas[person]) ?? defaultLocalPersona);
  }, []);

  return (
    <ApplicationAccount
      name={name}
      loadingLabel={t("loadingAccount")}
      menuLabel={t("accountMenu")}
    />
  );
};
