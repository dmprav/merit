import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { useTranslation } from "react-i18next";

import { localPersona, localPersonCookie, readLocalPersonCookie } from "@merit/auth/local-personas";
import { ApplicationAccount } from "@merit/ui/application-shell";

const readPerson = createIsomorphicFn()
  .server(() => getCookie(localPersonCookie))
  .client(() => readLocalPersonCookie(document.cookie));

export const LocalAccount = () => {
  const { t } = useTranslation("common");
  const { name } = localPersona(readPerson());

  return (
    <ApplicationAccount
      name={name}
      loadingLabel={t("loadingAccount")}
      menuLabel={t("accountMenu")}
    />
  );
};
