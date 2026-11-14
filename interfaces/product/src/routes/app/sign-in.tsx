import { SignIn, useClerk, useUser } from "@clerk/tanstack-react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import linkStyles from "@merit/ui/link.module.css";
import { StateMessage } from "@merit/ui/state-message";

import { webTranslator } from "../../app/messages";
import { StandalonePage } from "../../components/standalone-page";
import localStyles from "./sign-in.module.css";

const AccountSignIn = ({ returnTo }: { returnTo: string }) => {
  const { user } = useUser();
  const { t } = useTranslation("onboarding");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const signOut = async () => {
    setPending(true);
    setError("");

    try {
      await clerk.signOut({ redirectUrl: `/app/sign-in?returnTo=${encodeURIComponent(returnTo)}` });
    } catch {
      setError(t("signOutFailed"));
    }

    setPending(false);
  };

  const clerk = useClerk();

  return user ? (
    <div>
      <p>
        {user.primaryEmailAddress
          ? t("signedInAs", { email: user.primaryEmailAddress.emailAddress })
          : t("signedIn")}
      </p>
      <p className={localStyles.description}>{t("switchAccountHelp")}</p>
      {error && <p role="alert">{error}</p>}
      <Button isPending={pending} onPress={signOut}>
        {t("switchAccount")}
      </Button>
      <a href={returnTo} className={`${linkStyles.text} ${linkStyles.standalone}`}>
        {t("continueSignIn")}
      </a>
    </div>
  ) : (
    <SignIn
      routing="hash"
      forceRedirectUrl={returnTo}
      signUpForceRedirectUrl={returnTo}
      appearance={{
        variables: {
          colorPrimary: "var(--action)",
          colorPrimaryForeground: "var(--on-action)",
          colorBackground: "var(--surface)",
          colorForeground: "var(--foreground)",
          colorMuted: "var(--surface-muted)",
          colorMutedForeground: "var(--muted)",
          colorBorder: "var(--border-control)",
          colorInput: "var(--surface)",
          colorInputForeground: "var(--foreground)",
          colorDanger: "var(--danger)",
          colorSuccess: "var(--success)",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-body)",
          borderRadius: "var(--control-radius)",
        },
        elements: { rootBox: localStyles.form, cardBox: localStyles.card },
      }}
    />
  );
};

const SignInPage = () => {
  const { returnTo = "/app" } = Route.useSearch();
  const { t } = useTranslation(["web", "common"]);
  if (!import.meta.env.MERIT_LOCAL_WORKSPACE && !import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
    return (
      <StandalonePage>
        <StateMessage
          title={t("signIn.unavailable.title")}
          description={t("signIn.unavailable.description")}
          actions={
            <>
              <Button onPress={() => window.location.reload()}>{t("common:tryAgain")}</Button>
              <Link to="/demo" className={linkStyles.button} data-variant="secondary">
                {t("signIn.tryDemo")}
              </Link>
            </>
          }
        />
      </StandalonePage>
    );
  }

  return (
    <StandalonePage>
      <div className={localStyles.introduction}>
        <h1 className={localStyles.title}>{t("signIn.title")}</h1>
        <p className={localStyles.description}>{t("signIn.description")}</p>
      </div>
      {import.meta.env.MERIT_LOCAL_WORKSPACE ? (
        <Link to="/app" className={linkStyles.button} data-variant="primary">
          {t("backToWorkspace")}
        </Link>
      ) : (
        <AccountSignIn returnTo={returnTo} />
      )}
      <p className={localStyles.demo}>
        <Link to="/demo" className={`${linkStyles.text} ${linkStyles.standalone}`}>
          {t("signIn.tryDemo")}
        </Link>
        <span className={localStyles.description}>{t("signIn.demoDescription")}</span>
      </p>
    </StandalonePage>
  );
};

const allowedReturnTo =
  /^(?:\/app(?:\/(?!sign-in(?:\/|$))[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?|\/admin\/(?:organizations|access-requests)|\/invitations\/[a-f0-9]{64})$/;

export const Route = createFileRoute("/_product/app/sign-in")({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } => ({
    returnTo:
      typeof search.returnTo === "string" &&
      !/[\r\n]/.test(search.returnTo) &&
      allowedReturnTo.test(search.returnTo)
        ? search.returnTo
        : undefined,
  }),
  head: ({ match: { context } }) => {
    const t = webTranslator(context.locale);
    return { meta: [{ title: t("page.signIn") }] };
  },
  component: SignInPage,
});
