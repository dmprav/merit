type DraftSession = {
  start: (precedingWrites: Promise<void>) => void;
  whenIdle: () => Promise<void>;
  invalidate: () => void;
};

type Registration = { scope: string | undefined; kind: string; users: number };

export class DraftSessions {
  private sessions = new Map<DraftSession, Registration>();

  register(scope: string | undefined, kind: string, session: DraftSession) {
    let registration = this.sessions.get(session);
    if (!registration) {
      const precedingWrites = this.waitForPrecedingWrites(scope, kind);
      registration = { scope, kind, users: 0 };
      this.sessions.set(session, registration);
      session.start(precedingWrites);
    }
    registration.users += 1;
    const current = registration;
    return () => {
      current.users -= 1;
      void session.whenIdle().then(() => {
        if (!current.users) {
          this.sessions.delete(session);
        }
      });
    };
  }

  private async waitForPrecedingWrites(scope: string | undefined, kind: string) {
    // A replacement editor must see writes queued before its predecessor unmounted.
    await Promise.all(
      [...this.sessions]
        .filter(([, identity]) => identity.scope === scope && identity.kind === kind)
        .map(([session]) => session.whenIdle()),
    );
  }

  async invalidate(scope?: string) {
    const current = [...this.sessions]
      .filter(([, identity]) => scope === undefined || identity.scope === scope)
      .map(([session]) => session);
    for (const session of current) {
      session.invalidate();
    }
    await Promise.all(current.map((session) => session.whenIdle()));
  }
}

export const sessions = new DraftSessions();
