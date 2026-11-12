import { z } from "zod";

export const provenanceSchema = z.discriminatedUnion("interface", [
  z.object({ interface: z.literal("web") }),
  z.object({ interface: z.literal("mcp"), clientId: z.string().min(1) }),
]);

export type Provenance = z.infer<typeof provenanceSchema>;

// Web adapters use the default. MCP adapters must supply verified client provenance.
export type Actor = { userId: string; provenance?: Provenance };

export const actorProvenance = (actor: Actor): Provenance =>
  actor.provenance ?? { interface: "web" };

export type Identity =
  | { status: "authenticated"; actor: Actor }
  | { status: "signed_out" | "unavailable" };

export class AuthenticationError extends Error {
  readonly reason: "unauthenticated" | "disabled" | "unavailable";
  constructor(reason: "unauthenticated" | "disabled" | "unavailable") {
    super(`Authentication ${reason}`);
    this.reason = reason;
  }
}
