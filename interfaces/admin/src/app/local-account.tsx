import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { localPersona, readLocalPersonCookie } from "@merit/auth/local-personas";
import { ApplicationAccount } from "@merit/ui/application-shell";

export const LocalAccount = () => {
  const { t } = useTranslation("common");
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    setName(localPersona(readLocalPersonCookie(document.cookie)).name);
  }, []);

  return (
    <ApplicationAccount
      name={name}
      loadingLabel={t("loadingAccount")}
      menuLabel={t("accountMenu")}
    />
  );
};
