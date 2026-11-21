import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import {
  localPersona,
  localPersonas,
  localPersonCookie,
  readLocalPersonCookie,
} from "@merit/auth/local-personas";
import { clearDrafts } from "@merit/drafts";
import { Button } from "@merit/ui/button";

import styles from "./development-tools.module.css";

const selectPerson = async (person: string) => {
  if (!import.meta.env.MERIT_LOCAL_WORKSPACE) {
    return;
  }
  await clearDrafts();
  document.cookie = `${localPersonCookie}=${person}; Path=/; SameSite=Strict`;
  window.location.assign("/app");
};

const MeritPanel = () => {
  const local = import.meta.env.MERIT_LOCAL_WORKSPACE === true;
  const current = localPersona(readLocalPersonCookie(document.cookie));

  return (
    <section className={styles.panel} data-product-theme="" aria-label="Merit development tools">
      <h2>Development environment</h2>
      <p>
        Authentication: <strong>{local ? "Local fixtures" : "Clerk"}</strong>
      </p>
      {local ? (
        <>
          <p aria-live="polite">
            Current identity: <strong>{current.name}</strong> (
            {current.id === "manager" ? "Seeded Alder program manager" : current.email})
          </p>
          <div className={styles.people} role="group" aria-label="Local identity">
            {localPersonas.map((person) => (
              <Button
                key={person.id}
                variant={person.id === current.id ? "primary" : "secondary"}
                aria-pressed={person.id === current.id}
                onPress={() => selectPerson(person.id)}
              >
                {person.name}
              </Button>
            ))}
          </div>
          <p className={styles.hint}>
            Switching opens your workspace and clears unsaved changes. Workspace access still
            follows stored memberships.
          </p>
        </>
      ) : (
        <p className={styles.hint}>
          {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
            ? "Clerk UI is configured. Sign-in also requires the server secret key."
            : "Sign-in unavailable: configure Clerk keys to use real accounts."}{" "}
          For fictional accounts, start the host with <code>vp run dev:workspace</code>.
        </p>
      )}
      <nav className={styles.links} aria-label="Development shortcuts">
        <a href="/admin/organizations">Organization administration</a>
        <a href="/app">Workspace</a>
        <a href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">
          Mailpit inbox
        </a>
      </nav>
    </section>
  );
};

export default function DevelopmentTools() {
  return (
    <TanStackDevtools
      config={{ position: "middle-left", triggerMode: "fixed" }}
      eventBusConfig={{ connectToServerBus: false }}
      plugins={[
        { id: "merit", name: "Merit", defaultOpen: true, render: <MeritPanel /> },
        { id: "query", name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
        { id: "router", name: "TanStack Router", render: <TanStackRouterDevtoolsPanel /> },
      ]}
    />
  );
}
